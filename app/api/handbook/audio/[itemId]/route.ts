import { NextResponse, type NextRequest } from "next/server";
import { getLiveSession, hasAccess } from "@/lib/auth/guard";
import { isUuid } from "@/lib/ids";
import { isStorageConfigured } from "@/lib/storage/storage";
import { candidateAudioLink } from "@/lib/voice/listen";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Listen: one Handbook page's audio for the signed-in candidate. Checked live (blocked, expired, password changed),
// then the browser is sent on to a short-lived private link; nothing is read or stored here.
export async function GET(_request: NextRequest, context: RouteContext<"/api/handbook/audio/[itemId]">) {
  const live = await getLiveSession();
  if (!live || live.account.role !== "candidate" || !hasAccess(live.account)) {
    return new NextResponse("Your sign-in has ended.", { status: 401, headers: NO_STORE });
  }
  const { itemId } = await context.params;
  if (!isUuid(itemId) || !isStorageConfigured()) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  let link: string | null;
  try {
    link = await candidateAudioLink(live.session.sub, itemId);
  } catch (error) {
    console.error("Listen: audio link failed", error);
    return new NextResponse("Audio couldn't be opened.", { status: 503, headers: NO_STORE });
  }
  if (!link) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  return NextResponse.redirect(link, { status: 302, headers: NO_STORE });
}
