"use client";

import { useState } from "react";
import { Cell, Row, Table } from "@/components/admin/table";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { countOf, formatBytes } from "@/lib/format";
import type { AudioLanguageRow } from "@/lib/content/backup/audio-format";
import { buildAudioBackup, reportAudioSaved } from "@/lib/content/backup/audio-zip";
import { saveFile } from "../save-file";

type State =
  | { status: "idle" }
  | { status: "working"; code: string; step: string }
  | { status: "failed"; code: string; message: string }
  | { status: "done"; code: string; fileName: string; bytes: number; recorded: boolean };

// One audio backup per language: audio costs service calls (and daily limits), so each language can be kept safe
// as soon as it's made.
export function AudioBackups({ languages }: { languages: AudioLanguageRow[] }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const working = state.status === "working";

  async function onDownload(code: string) {
    setState({ status: "working", code, step: "Starting…" });
    const built = await buildAudioBackup(code, (step) => setState({ status: "working", code, step }));
    if (!built.ok) {
      setState({ status: "failed", code, message: built.error });
      return;
    }
    saveFile(built.fileName, built.zip);
    const recorded = await reportAudioSaved(built.fileName, built.manifest);
    setState({ status: "done", code, fileName: built.fileName, bytes: built.zip.length, recorded });
  }

  const current = state.status === "idle" ? null : languages.find((language) => language.code === state.code);
  return (
    <section aria-labelledby="audio-backups-heading" className={`${cardClass} max-w-3xl space-y-3 p-4`}>
      <h2 id="audio-backups-heading" className="text-base font-semibold text-ink">
        Audio backups
      </h2>
      <p className="text-sm text-ink">
        Listen audio, one zip per language: each file with the page or question it belongs to. Restore puts it back in the same place, so it
        doesn&apos;t have to be made again. Download a language again after making more of its audio.
      </p>
      <Table columns={["Language", "Audio", "Size", "Backup"]} isEmpty={languages.length === 0} emptyMessage="No audio has been made yet.">
        {languages.map((language) => (
          <Row key={language.code}>
            <Cell kind="primary">{language.name}</Cell>
            <Cell label="Audio">{[language.pages > 0 ? countOf(language.pages, "page") : "", language.questions > 0 ? countOf(language.questions, "question") : ""].filter(Boolean).join(" · ")}</Cell>
            <Cell label="Size" nowrap>
              {formatBytes(language.bytes)}
            </Cell>
            <Cell label="Backup">
              <button
                type="button"
                onClick={() => onDownload(language.code)}
                disabled={working}
                aria-label={`Download ${language.name} audio backup`}
                className={buttonClass("secondary")}
              >
                {working && state.code === language.code ? "Making the backup…" : "Download audio backup"}
              </button>
            </Cell>
          </Row>
        ))}
      </Table>
      <div aria-live="polite">
        {state.status === "working" && (
          <p className="text-sm text-slate-600">
            {current?.name}: {state.step} Keep this page open.
          </p>
        )}
        {state.status === "failed" && (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
            {current?.name}: {state.message}
          </p>
        )}
        {state.status === "done" && (
          <div role="status" className="space-y-1 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-strong">
            <p>
              {state.fileName} ({formatBytes(state.bytes)}) is in your downloads. Keep a copy somewhere safe, not only on this computer.
            </p>
            {!state.recorded && <p>The backup is saved, but it couldn&apos;t be noted in the Activity log (connection). That doesn&apos;t affect the file.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
