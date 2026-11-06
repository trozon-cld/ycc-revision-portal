import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { logActivity } from "@/lib/audit/log";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { DATABASE_BACKUP_KIND_LABELS, DOWNLOAD_LINK_SECONDS, downloadName } from "@/lib/database-backup/format";
import { findDatabaseBackup } from "@/lib/database-backup/list";
import { withTransaction } from "@/lib/db/transaction";
import { formatBytes } from "@/lib/format";
import { uuidOrNull } from "@/lib/ids";
import { getDownloadUrl } from "@/lib/storage/storage";
import { isRecord } from "@/lib/text";

const NOT_FOUND = "That backup couldn't be downloaded. It may have been removed; refresh the page and try another.";

// Logs the download, then gives the browser a short-lived private link to the file (fetched straight from storage, so
// the host's response limit doesn't apply).
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to download a backup." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const body = await readSmallJson(request, 1024);
  const id = body.ok && isRecord(body.value) ? uuidOrNull(body.value.id) : null;
  const backup = id ? await findDatabaseBackup(id) : null;
  if (!backup) return NextResponse.json({ ok: false, error: NOT_FOUND }, { status: 404 });
  try {
    const url = await getDownloadUrl(backup.file_path, DOWNLOAD_LINK_SECONDS, downloadName(backup), "backups");
    if (!url) return NextResponse.json({ ok: false, error: NOT_FOUND }, { status: 404 });
    await withTransaction((client) =>
      logActivity(client, live.session, "database.backup_downloaded", { type: "backup", id: backup.id, label: backup.file_path.slice("database/".length) }, {
        result: `${DATABASE_BACKUP_KIND_LABELS[backup.kind]} · ${formatBytes(backup.byte_size)}`,
      })
    );
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("Database backup download failed:", error);
    return NextResponse.json({ ok: false, error: "The download couldn't be started. Please try again." }, { status: 500 });
  }
}
