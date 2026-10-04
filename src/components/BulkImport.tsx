import { FileAudio, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import type { Participant, Study, Transcript, TranscriptLine } from "../../shared/types";
import { codesInFileName, fileStem, makeId, matchParticipant, nowIso, parseTranscript } from "../../shared/util";
import { api, readDocumentText, uploadMedia } from "../api";
import { Button, Modal, Progress, useApp } from "../ui";
import type { UpdateStudy } from "../useStudy";

export const MEDIA_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "mkv", "avi", "mp3", "m4a", "wav", "aac", "ogg", "opus", "flac", "wma", "amr"];
export const TRANSCRIPT_EXTENSIONS = ["docx", "pdf", "txt", "srt", "vtt", "csv", "xlsx"];
export const BULK_ACCEPT = [...MEDIA_EXTENSIONS, ...TRANSCRIPT_EXTENSIONS].map((ext) => `.${ext}`).join(",");

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

type Row = { file: File; kind: "media" | "transcript" | "unsupported"; target: string };
const NEW = "__new__";
const SKIP = "__skip__";

function suggestedNewParticipant(file: File, existingCodes: Set<string>, index: number) {
  const token = codesInFileName(file.name)[0];
  let code = token ? token.text : "";
  if (!code || existingCodes.has(code)) {
    let n = existingCodes.size + index + 1;
    while (existingCodes.has(`R${String(n).padStart(2, "0")}`)) n += 1;
    code = `R${String(n).padStart(2, "0")}`;
  }
  // "R01 Priya - Lucknow.docx" → name "Priya" (text after the code, up to the first separator)
  const rest = fileStem(file.name).replace(token?.raw ?? "", " ")
    .replace(/\b(transcript|transcription|idi|fgd|final|video|audio|recording|interview|translated|english|hindi)\b/gi, " ");
  const name = rest.split(/\s[-–|]\s|[|]/).map((part) => part.replace(/[\s.\-–]+/g, " ").trim()).find(Boolean) ?? "";
  return { code, name };
}

/** Import many transcripts and recordings at once, matched to participants by filename. */
export function BulkImport({ study, files, transcriptIndex, update, flush, onClose, onDone }: {
  study: Study; files: File[]; transcriptIndex: Record<string, { lines: number }>; update: UpdateStudy; flush: () => Promise<void>; onClose: () => void; onDone: () => Promise<void> | void;
}) {
  const { notify } = useApp();
  const [rows, setRows] = useState<Row[]>(() => files
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((file) => {
      const ext = extensionOf(file.name);
      const kind = MEDIA_EXTENSIONS.includes(ext) ? "media" : TRANSCRIPT_EXTENSIONS.includes(ext) ? "transcript" : "unsupported";
      const match = matchParticipant(file.name, study.participants);
      return { file, kind, target: kind === "unsupported" ? SKIP : match?.id ?? NEW };
    }));
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  // Files that would create the same new participant share one, e.g. "R05 audio.mp3" + "R05 transcript.docx".
  const newParticipants = useMemo(() => {
    const codes = new Set(study.participants.map((participant) => participant.code.toUpperCase()));
    const byKey = new Map<string, { code: string; name: string }>();
    rows.forEach((row, index) => {
      if (row.target !== NEW) return;
      const suggestion = suggestedNewParticipant(row.file, codes, index);
      const key = codesInFileName(row.file.name)[0]?.text.toUpperCase() ?? `${suggestion.code}:${row.file.name}`;
      if (!byKey.has(key)) {
        byKey.set(key, suggestion);
        codes.add(suggestion.code);
      }
    });
    return byKey;
  }, [rows, study.participants]);

  const newKeyFor = (row: Row) => {
    const token = codesInFileName(row.file.name)[0]?.text.toUpperCase();
    if (token && newParticipants.has(token)) return token;
    return [...newParticipants.keys()].find((key) => key.endsWith(`:${row.file.name}`)) ?? "";
  };


  const run = async () => {
    const work = rows.filter((row) => row.target !== SKIP && row.kind !== "unsupported");
    if (!work.length) return onClose();
    setProgress({ done: 0, total: work.length, label: "Preparing…" });

    // 1. Create new participants.
    const created = new Map<string, Participant>();
    for (const [key, suggestion] of newParticipants) {
      created.set(key, {
        id: makeId("p"), code: suggestion.code, name: suggestion.name, segmentId: null, city: "", age: null, gender: "",
        sessionType: "IDI", sessionDate: "", notes: "", media: [],
      });
    }
    if (created.size) update((current) => ({ ...current, participants: [...current.participants, ...created.values()] }));
    const resolve = (row: Row) => row.target === NEW ? created.get(newKeyFor(row))?.id : row.target;

    // 2. Upload recordings, and read transcripts (several files for one person are joined in filename order).
    const failures: string[] = [];
    const transcripts = new Map<string, TranscriptLine[]>();
    let done = 0;
    for (const row of work) {
      const participantId = resolve(row);
      if (!participantId) { failures.push(`${row.file.name}: no participant`); continue; }
      try {
        if (row.kind === "media") {
          setProgress({ done, total: work.length, label: `Copying ${row.file.name}…` });
          const media = await uploadMedia(study.id, row.file, (fraction) => setProgress({ done: done + fraction, total: work.length, label: `Copying ${row.file.name}…` }));
          update((current) => ({ ...current, participants: current.participants.map((p) => p.id === participantId ? { ...p, media: [...p.media, media] } : p) }));
        } else {
          setProgress({ done, total: work.length, label: `Reading ${row.file.name}…` });
          const lines = parseTranscript(await readDocumentText(row.file, "transcript"));
          if (!lines.length) throw new Error("no text found");
          transcripts.set(participantId, [...(transcripts.get(participantId) ?? []), ...lines]);
        }
      } catch (error) {
        failures.push(`${row.file.name}: ${(error as Error).message}`);
      }
      done += 1;
    }
    for (const [participantId, lines] of transcripts) {
      const transcript: Transcript = { participantId, lines, source: "import", language: "", updatedAt: nowIso() };
      try { await api.saveTranscript(study.id, transcript); }
      catch (error) { failures.push(`Transcript for ${participantId}: ${(error as Error).message}`); }
    }
    await flush();
    await onDone();
    setProgress(null);
    const recordings = work.filter((row) => row.kind === "media").length;
    notify(`Imported ${transcripts.size} transcript(s) and ${recordings} recording(s)${created.size ? `, added ${created.size} participant(s)` : ""}.${failures.length ? ` ${failures.length} file(s) failed.` : ""}`, failures.length ? "error" : "success");
    if (failures.length) window.alert(`These files could not be imported:\n\n${failures.join("\n")}`);
    onClose();
  };

  const counts = { transcripts: rows.filter((row) => row.kind === "transcript" && row.target !== SKIP).length, media: rows.filter((row) => row.kind === "media" && row.target !== SKIP).length };

  return (
    <Modal wide title={`Import ${files.length} file${files.length === 1 ? "" : "s"}`} eyebrow="Bulk import" onClose={progress ? () => undefined : onClose} footer={progress ? (
      <div className="bulk-progress"><span>{progress.label}</span><Progress value={progress.done / progress.total} /></div>
    ) : <>
      <span className="muted-text small">{counts.transcripts} transcripts · {counts.media} recordings · {newParticipants.size} new participants</span>
      <span className="spacer" />
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={run}>Import</Button>
    </>}>
      <p className="muted-text">Files are matched to participants by the code or name in the filename (e.g. “R01 Priya.docx”). Check each row, then import. Recordings are copied into the study folder on this computer.</p>
      <table className="bulk-table">
        <thead><tr><th>File</th><th>Participant</th><th /></tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const suggestion = row.target === NEW ? newParticipants.get(newKeyFor(row)) : null;
            return (
              <tr key={`${row.file.name}-${index}`}>
                <td className="bulk-file">{row.kind === "media" ? <FileAudio size={15} /> : <FileText size={15} />} {row.file.name}</td>
                <td>
                  {row.kind === "unsupported" ? <span className="bad small">Unsupported file type</span> : (
                    <select value={row.target} onChange={(event) => setRows((list) => list.map((entry, i) => i === index ? { ...entry, target: event.target.value } : entry))}>
                      {study.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.code} · {participant.name || "—"}</option>)}
                      <option value={NEW}>+ New participant{suggestion ? `: ${suggestion.code} ${suggestion.name}` : ""}</option>
                      <option value={SKIP}>Skip this file</option>
                    </select>
                  )}
                </td>
                <td className="small muted-text">
                  {row.kind === "transcript" && transcriptIndex[row.target]?.lines ? "Replaces existing transcript" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
