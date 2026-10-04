import { FileAudio, FileText, FolderInput, Mic, Pause, Play, Plus, RotateCcw, RotateCw, Search, StickyNote, Tag, Trash2, Upload, Users, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobStatus, Observation, Participant, Transcript, TranscriptLine } from "../../shared/types";
import { allQuestions, formatTime, makeId, nowIso, parseTranscript } from "../../shared/util";
import { api, readDocumentText, uploadMedia } from "../api";
import { BULK_ACCEPT, BulkImport } from "../components/BulkImport";
import type { ViewProps } from "../components/Workspace";
import { Button, EmptyState, Field, Modal, pickFile, Progress, useAction, useApp } from "../ui";

const MEDIA_ACCEPT = "video/*,audio/*,.mp4,.mov,.mkv,.webm,.avi,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac,.wma,.amr";
export const TRANSCRIPT_ACCEPT = ".docx,.pdf,.txt,.srt,.vtt,.csv,.xlsx,.doc";

export function nextCanvasPosition(count: number) {
  return { x: 30 + (count % 4) * 240, y: 30 + Math.floor(count / 4) * 190 };
}

export function SessionsView({ study, update, flush, transcriptIndex, refreshTranscripts, goTo, focus }: ViewProps) {
  const { notify, sttReady, openSettings } = useApp();
  const action = useAction();
  const [selectedId, setSelectedId] = useState<string | null>(focus?.participantId ?? study.participants[0]?.id ?? null);
  const participant = study.participants.find((entry) => entry.id === selectedId) ?? study.participants[0] ?? null;
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [upload, setUpload] = useState<{ name: string; progress: number } | null>(null);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [composer, setComposer] = useState<{ quote: string; time: number | null } | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[] | null>(null);
  const startBulkImport = async () => {
    const files = await pickFile(BULK_ACCEPT, true);
    if (files.length) setBulkFiles(files);
  };
  const bulkDialog = bulkFiles && (
    <BulkImport study={study} files={bulkFiles} transcriptIndex={transcriptIndex} update={update} flush={flush} onClose={() => setBulkFiles(null)}
      onDone={async () => { await refreshTranscripts(); if (participant) await loadTranscript(participant.id); }} />
  );
  const [mediaIndex, setMediaIndex] = useState(0);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const pendingSeek = useRef<number | null>(focus?.time ?? null);

  // ---- transcript loading / saving ----
  const loadTranscript = useCallback(async (participantId: string) => {
    setLoadingTranscript(true);
    try { setTranscript(await api.transcript(study.id, participantId)); }
    catch (error) { notify((error as Error).message, "error"); }
    finally { setLoadingTranscript(false); }
  }, [study.id, notify]);

  useEffect(() => {
    setTranscript(null);
    setMediaIndex(0);
    setCurrentTime(0);
    if (participant) void loadTranscript(participant.id);
  }, [participant?.id, loadTranscript]);

  const saveTimer = useRef<number | undefined>(undefined);
  const changeTranscript = (next: Transcript) => {
    setTranscript(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.saveTranscript(study.id, next).then(refreshTranscripts).catch((error) => notify(`Transcript not saved: ${error.message}`, "error"));
    }, 700);
  };

  // ---- transcription jobs ----
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const poll = async () => {
      try {
        const list = await api.jobs(study.id);
        if (stopped) return;
        setJobs((previous) => {
          for (const job of list) {
            const before = previous.find((entry) => entry.id === job.id);
            if (before && before.state !== job.state && job.state === "done") {
              notify(`Transcript ready for ${study.participants.find((p) => p.id === job.participantId)?.code ?? "participant"}.`, "success");
              void refreshTranscripts();
              if (job.participantId === participant?.id) void loadTranscript(job.participantId);
            }
            if (before && before.state !== job.state && job.state === "error") notify(`Transcription failed: ${job.message}`, "error");
          }
          return list;
        });
        const active = list.some((job) => job.state === "queued" || job.state === "running");
        timer = window.setTimeout(poll, active ? 2000 : 8000);
      } catch {
        timer = window.setTimeout(poll, 8000);
      }
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [study.id, participant?.id]);

  const activeJob = jobs.find((job) => job.participantId === participant?.id && (job.state === "queued" || job.state === "running"));

  // ---- media ----
  const media = participant?.media[mediaIndex] ?? participant?.media[0] ?? null;
  const isVideo = media ? media.mime.startsWith("video") : false;
  const seek = (time: number | null) => {
    if (time === null || !mediaRef.current) return;
    mediaRef.current.currentTime = time;
    setCurrentTime(time);
  };
  useEffect(() => {
    if (!focus) return;
    if (focus.participantId && focus.participantId !== participant?.id) {
      setSelectedId(focus.participantId);
      pendingSeek.current = focus.time ?? null;
    } else if (focus.time !== undefined && focus.time !== null && mediaRef.current && mediaRef.current.readyState >= 1) {
      mediaRef.current.currentTime = focus.time;
    } else {
      pendingSeek.current = focus.time ?? null;
    }
  }, [focus]);

  const addRecording = async () => {
    if (!participant) return;
    const files = await pickFile(MEDIA_ACCEPT, true);
    for (const file of files) {
      setUpload({ name: file.name, progress: 0 });
      try {
        const saved = await uploadMedia(study.id, file, (progress) => setUpload({ name: file.name, progress }));
        update((current) => ({ ...current, participants: current.participants.map((entry) => entry.id === participant.id ? { ...entry, media: [...entry.media, saved] } : entry) }));
        notify(`Added ${file.name}.`, "success");
      } catch (error) {
        notify((error as Error).message, "error");
      }
    }
    setUpload(null);
  };

  const importTranscript = async () => {
    if (!participant) return;
    const [file] = await pickFile(TRANSCRIPT_ACCEPT);
    if (!file) return;
    try {
      const lines = parseTranscript(await readDocumentText(file, "transcript"));
      if (!lines.length) throw new Error("No transcript text was found in that file.");
      if (transcript?.lines.length && !window.confirm("Replace the existing transcript for this participant?")) return;
      const next: Transcript = { participantId: participant.id, lines, source: "import", language: "", updatedAt: nowIso() };
      await api.saveTranscript(study.id, next);
      setTranscript(next);
      await refreshTranscripts();
      const timed = lines.filter((line) => line.start !== null).length;
      notify(`Imported ${lines.length} lines${timed ? "" : " (no timestamps found — lines won't link to the recording)"}.`, "success");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const startTranscription = action(async () => {
    if (!participant || !media) return;
    if (transcript?.lines.length && !window.confirm("This participant already has a transcript. Replace it with a new automatic transcript when it's ready?")) return;
    await flush(); // the server reads the recording list from the saved study
    const job = await api.transcribe(study.id, participant.id, media.id);
    setJobs((list) => [...list.filter((entry) => entry.id !== job.id), job]);
  });

  // ---- notes ----
  const observations = study.observations.filter((observation) => observation.participantId === participant?.id);
  const saveObservation = (draft: Omit<Observation, "id" | "x" | "y" | "participantId">) => {
    if (!participant) return;
    update((current) => ({
      ...current,
      observations: [...current.observations, { ...draft, id: makeId("o"), participantId: participant.id, ...nextCanvasPosition(current.observations.length) }],
    }));
    setComposer(null);
    notify("Note logged. It will appear on the Inference canvas.", "success");
  };

  // Keyboard shortcuts while reviewing: Alt+K play/pause, Alt+J/L ±5s, Alt+N note.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      const element = mediaRef.current;
      const key = event.key.toLowerCase();
      if (key === "k" && element) { event.preventDefault(); if (element.paused) void element.play(); else element.pause(); }
      if (key === "j" && element) { event.preventDefault(); element.currentTime = Math.max(0, element.currentTime - 5); }
      if (key === "l" && element) { event.preventDefault(); element.currentTime += 5; }
      if (key === "n") { event.preventDefault(); setComposer({ quote: window.getSelection()?.toString().trim() ?? "", time: element ? element.currentTime : null }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!study.participants.length) {
    return (
      <>
        <EmptyState icon={<Users size={28} />} title="No participants yet">
          <p>Import your transcripts and recordings in one go — participants are created from the file names (e.g. “R01 Priya.docx”). Or set up participants first in Setup.</p>
          <div className="row-actions center">
            <Button onClick={() => goTo("setup")}>Go to Setup</Button>
            <Button variant="primary" onClick={startBulkImport} icon={<FolderInput size={15} />}>Import transcripts & recordings</Button>
          </div>
        </EmptyState>
        {bulkDialog}
      </>
    );
  }

  return (
    <div className="sessions">
      <ParticipantList study={study} selectedId={participant?.id ?? null} onSelect={setSelectedId} transcriptIndex={transcriptIndex} jobs={jobs} />

      {participant && (
        <div className="session-main">
          <div className="participant-header">
            <div>
              <div className="eyebrow">{study.segments.find((segment) => segment.id === participant.segmentId)?.name ?? "No segment"}</div>
              <h2>{participant.code} <span className="muted">{participant.name}</span></h2>
              <div className="pills">
                {[participant.sessionType, participant.city, participant.age ? `${participant.age} yrs` : "", participant.gender, participant.sessionDate].filter(Boolean).map((value) => <span key={value}>{value}</span>)}
              </div>
            </div>
            <div className="row-actions">
              <Button onClick={startBulkImport} icon={<FolderInput size={15} />}>Bulk import</Button>
              <Button onClick={addRecording} icon={<Upload size={15} />}>Add recording</Button>
              <Button onClick={importTranscript} icon={<FileText size={15} />}>Import transcript</Button>
            </div>
          </div>

          <div className="evidence-grid">
            <div className="media-card">
              {upload && <div className="upload-status"><span>Copying {upload.name} into the study…</span><Progress value={upload.progress} /></div>}
              {media ? (
                <>
                  {participant.media.length > 1 && (
                    <div className="media-tabs">
                      {participant.media.map((entry, index) => <button key={entry.id} className={index === mediaIndex ? "active" : ""} onClick={() => setMediaIndex(index)}>{entry.originalName}</button>)}
                    </div>
                  )}
                  <video
                    key={media.id}
                    ref={mediaRef}
                    className={isVideo ? "player" : "player audio"}
                    src={api.mediaUrl(study.id, media)}
                    controls
                    preload="metadata"
                    onLoadedMetadata={(event) => {
                      event.currentTarget.playbackRate = rate;
                      if (pendingSeek.current !== null) { event.currentTarget.currentTime = pendingSeek.current; pendingSeek.current = null; }
                    }}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() => notify(`This browser can't play ${media.originalName}. Use Google Chrome or Microsoft Edge, or convert the file to MP4 (H.264). It can still be transcribed.`, "error")}
                  />
                  <div className="player-controls">
                    <button className="icon-btn" title="Back 5 s (Alt+J)" onClick={() => seek(Math.max(0, currentTime - 5))}><RotateCcw size={16} /></button>
                    <button className="icon-btn" title="Play / pause (Alt+K)" onClick={() => { const el = mediaRef.current; if (el) { if (el.paused) void el.play(); else el.pause(); } }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
                    <button className="icon-btn" title="Forward 5 s (Alt+L)" onClick={() => seek(currentTime + 5)}><RotateCw size={16} /></button>
                    <span className="time">{formatTime(currentTime)}</span>
                    <select value={rate} onChange={(event) => { const value = Number(event.target.value); setRate(value); if (mediaRef.current) mediaRef.current.playbackRate = value; }} aria-label="Playback speed">
                      {[0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
                    </select>
                    <span className="spacer" />
                    <Button size="small" variant="primary" onClick={() => setComposer({ quote: "", time: currentTime })} icon={<StickyNote size={14} />}>Note at {formatTime(currentTime)}</Button>
                  </div>
                  <div className="transcribe-bar">
                    {activeJob ? (
                      <div className="job"><Mic size={15} /> <span>{activeJob.message}</span><Progress value={activeJob.progress} /></div>
                    ) : sttReady ? (
                      <Button onClick={startTranscription} icon={<Wand2 size={15} />}>Transcribe this recording</Button>
                    ) : (
                      <span className="muted-text small">To transcribe automatically, <button className="link-btn" onClick={() => openSettings("stt")}>connect a transcription service</button>. Or import a transcript file.</span>
                    )}
                    <span className="spacer" />
                    <button className="link-btn danger" onClick={async () => {
                      if (!window.confirm(`Remove ${media.originalName} from this study? The file copy in the study folder will be deleted.`)) return;
                      await api.deleteMedia(study.id, media).catch(() => undefined);
                      update((current) => ({ ...current, participants: current.participants.map((entry) => entry.id === participant.id ? { ...entry, media: entry.media.filter((m) => m.id !== media.id) } : entry) }));
                      setMediaIndex(0);
                    }}><Trash2 size={13} /> Remove recording</button>
                  </div>
                </>
              ) : (
                <button className="drop-target" onClick={addRecording}>
                  <FileAudio size={30} />
                  <strong>Add the interview recording</strong>
                  <span>Video or audio (MP4, MOV, MP3, M4A, WAV…). The file is copied into this study's folder on this computer — nothing is uploaded online.</span>
                </button>
              )}
            </div>

            <TranscriptPanel
              transcript={transcript}
              loading={loadingTranscript}
              currentTime={media ? currentTime : null}
              onSeek={(line) => { if (media) seek(line.start); }}
              onNote={(quote, time) => setComposer({ quote, time })}
              onChange={changeTranscript}
              onImport={importTranscript}
            />
          </div>

          <div className="notes-strip">
            <div className="strip-title">
              <div><div className="eyebrow">Your notes</div><h3>{observations.length} observations for {participant.code}</h3></div>
              <Button size="small" onClick={() => setComposer({ quote: "", time: media ? currentTime : null })} icon={<Plus size={14} />}>New note</Button>
            </div>
            <div className="note-grid">
              {observations.map((observation) => (
                <div key={observation.id} className="note-card">
                  <div className="note-top">
                    {observation.code && <span className="tag"><Tag size={11} /> {observation.code}</span>}
                    {observation.time !== null && <button className="link-btn" onClick={() => seek(observation.time)}>{formatTime(observation.time)}</button>}
                    <button className="icon-btn danger small" title="Delete note" onClick={() => update((current) => ({
                      ...current,
                      observations: current.observations.filter((entry) => entry.id !== observation.id),
                      clusters: current.clusters.map((cluster) => ({ ...cluster, observationIds: cluster.observationIds.filter((id) => id !== observation.id) })),
                      connections: current.connections.filter((connection) => connection.from.id !== observation.id && connection.to.id !== observation.id),
                    }))}><Trash2 size={13} /></button>
                  </div>
                  <p>{observation.note}</p>
                  {observation.quote && <blockquote>“{observation.quote}”</blockquote>}
                </div>
              ))}
              {!observations.length && <p className="muted-text">Click a transcript line or select text, then “Note this”, to capture what you noticed. Shortcut: Alt+N.</p>}
            </div>
          </div>
        </div>
      )}

      {bulkDialog}
      {composer && participant && (
        <NoteComposer
          initial={composer}
          codes={[...new Set(study.observations.map((observation) => observation.code).filter(Boolean))]}
          questions={allQuestions(study.guide)}
          onClose={() => setComposer(null)}
          onSave={saveObservation}
        />
      )}
    </div>
  );
}

function ParticipantList({ study, selectedId, onSelect, transcriptIndex, jobs }: {
  study: ViewProps["study"]; selectedId: string | null; onSelect: (id: string) => void; transcriptIndex: ViewProps["transcriptIndex"]; jobs: JobStatus[];
}) {
  const groups = [...study.segments.map((segment) => ({ segment, people: study.participants.filter((p) => p.segmentId === segment.id) })),
    { segment: null, people: study.participants.filter((p) => !p.segmentId || !study.segments.some((s) => s.id === p.segmentId)) }]
    .filter((group) => group.people.length);
  const status = (participant: Participant) => {
    if (jobs.some((job) => job.participantId === participant.id && (job.state === "queued" || job.state === "running"))) return "Transcribing…";
    const lines = transcriptIndex[participant.id]?.lines ?? 0;
    if (lines) return `${lines} lines`;
    return participant.media.length ? "Recording, no transcript" : "No recording yet";
  };
  return (
    <aside className="side-list">
      {groups.map(({ segment, people }) => (
        <div key={segment?.id ?? "none"} className="side-group">
          <div className="side-label"><span className="dot" style={{ background: segment?.color ?? "#aaa" }} />{segment?.name ?? "No segment"}</div>
          {people.map((participant) => (
            <button key={participant.id} className={`side-item ${participant.id === selectedId ? "selected" : ""}`} onClick={() => onSelect(participant.id)}>
              <strong>{participant.code}</strong>
              <span>{participant.name || "—"}</span>
              <small className={transcriptIndex[participant.id]?.lines ? "ok" : ""}>{status(participant)}</small>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

function TranscriptPanel({ transcript, loading, currentTime, onSeek, onNote, onChange, onImport }: {
  transcript: Transcript | null; loading: boolean; currentTime: number | null;
  onSeek: (line: TranscriptLine) => void; onNote: (quote: string, time: number | null) => void;
  onChange: (transcript: Transcript) => void; onImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; time: number | null } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = transcript?.lines ?? [];
  const activeId = useMemo(() => {
    if (currentTime === null) return null;
    let active: string | null = null;
    for (const line of lines) {
      if (line.start !== null && line.start <= currentTime + 0.3) active = line.id;
      else if (line.start !== null && line.start > currentTime) break;
    }
    return active;
  }, [lines, currentTime]);

  useEffect(() => {
    if (!follow || !activeId || !scrollRef.current) return;
    const element = scrollRef.current.querySelector(`[data-line="${activeId}"]`);
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, follow]);

  const visible = query.trim() ? lines.filter((line) => `${line.speaker} ${line.text}`.toLowerCase().includes(query.toLowerCase())) : lines;
  const speakers = [...new Set(lines.map((line) => line.speaker).filter(Boolean))];

  const captureSelection = () => {
    const selected = window.getSelection();
    const text = selected?.toString().trim() ?? "";
    if (!text) return setSelection(null);
    const anchor = selected?.anchorNode instanceof Element ? selected.anchorNode : selected?.anchorNode?.parentElement;
    const lineId = anchor?.closest("[data-line]")?.getAttribute("data-line");
    setSelection({ text, time: lines.find((line) => line.id === lineId)?.start ?? null });
  };

  return (
    <div className="transcript-card">
      <div className="card-title-row">
        <div><div className="eyebrow">Transcript</div><h3>{lines.length ? `${lines.length} lines${transcript?.source === "ai" ? " · auto-transcribed" : ""}` : "No transcript yet"}</h3></div>
        {lines.length > 0 && (
          <div className="row-actions">
            <div className="search-input"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transcript" /></div>
            {speakers.length > 0 && <Button size="small" variant="ghost" onClick={() => setRenaming(true)}>Speakers</Button>}
            {currentTime !== null && <label className="toggle"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} /> Follow playback</label>}
          </div>
        )}
      </div>
      {selection && (
        <div className="selection-bar">
          <span>“{selection.text.length > 90 ? `${selection.text.slice(0, 90)}…` : selection.text}”</span>
          <Button size="small" variant="primary" icon={<StickyNote size={14} />} onClick={() => { onNote(selection.text, selection.time); setSelection(null); }}>Note this</Button>
        </div>
      )}
      <div className="transcript-scroll" ref={scrollRef} onMouseUp={captureSelection}>
        {loading && <p className="muted-text pad">Loading…</p>}
        {!loading && !lines.length && (
          <div className="pad">
            <p className="muted-text">Import the transcript (Word, PDF, Excel, TXT, SRT, VTT or CSV) — or transcribe the recording automatically.</p>
            <Button onClick={onImport} icon={<FileText size={15} />}>Import transcript</Button>
          </div>
        )}
        {visible.map((line) => (
          <div key={line.id} data-line={line.id} className={`transcript-line ${line.id === activeId ? "active" : ""}`}>
            <button className="line-time" onClick={() => onSeek(line)} title={line.start !== null ? "Play from here" : "No timestamp"}>{line.start !== null ? formatTime(line.start) : "—"}</button>
            <div className="line-body">
              {line.speaker && <span className="speaker">{line.speaker}</span>}
              {editingId === line.id ? (
                <textarea
                  autoFocus
                  defaultValue={line.text}
                  onBlur={(event) => {
                    setEditingId(null);
                    const text = event.target.value.trim();
                    if (transcript && text !== line.text) onChange({ ...transcript, lines: transcript.lines.map((entry) => entry.id === line.id ? { ...entry, text } : entry).filter((entry) => entry.text) });
                  }}
                  onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }}
                />
              ) : (
                <span className="line-text" onDoubleClick={() => setEditingId(line.id)}>{line.text}</span>
              )}
            </div>
            <button className="line-note" title="Note this line" onClick={() => onNote(line.text, line.start)}><StickyNote size={14} /></button>
          </div>
        ))}
      </div>
      {lines.length > 0 && <div className="transcript-foot muted-text small">Double-click a line to correct it. Select any text to note just that part.</div>}

      {renaming && transcript && (
        <SpeakerRename speakers={speakers} onClose={() => setRenaming(false)} onSave={(map) => {
          onChange({ ...transcript, lines: transcript.lines.map((line) => ({ ...line, speaker: map[line.speaker] ?? line.speaker })) });
          setRenaming(false);
        }} />
      )}
    </div>
  );
}

function SpeakerRename({ speakers, onClose, onSave }: { speakers: string[]; onClose: () => void; onSave: (map: Record<string, string>) => void }) {
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(speakers.map((speaker) => [speaker, speaker])));
  return (
    <Modal title="Name the speakers" eyebrow="Transcript" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={() => onSave(names)}>Apply</Button>
    </>}>
      <p className="muted-text">Automatic transcripts label voices as Speaker A, B… Rename them (e.g. Moderator, Respondent). Labels may differ between 10-minute parts of a long recording — check a few lines.</p>
      {speakers.map((speaker) => (
        <Field key={speaker} label={speaker}>
          <input value={names[speaker]} onChange={(event) => setNames((current) => ({ ...current, [speaker]: event.target.value }))} />
        </Field>
      ))}
    </Modal>
  );
}

function NoteComposer({ initial, codes, questions, onClose, onSave }: {
  initial: { quote: string; time: number | null };
  codes: string[];
  questions: { id: string; text: string; sectionTitle: string }[];
  onClose: () => void;
  onSave: (draft: Omit<Observation, "id" | "x" | "y" | "participantId">) => void;
}) {
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState(initial.quote);
  const [questionId, setQuestionId] = useState("");
  const save = () => note.trim() && onSave({ note: note.trim(), code: code.trim(), quote: quote.trim(), questionId: questionId || null, time: initial.time });
  return (
    <Modal title="What did you notice?" eyebrow={`New note${initial.time !== null ? ` · ${formatTime(initial.time)}` : ""}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!note.trim()} onClick={save}>Log note</Button>
    </>}>
      <Field label="Evidence (quote)">
        <textarea rows={3} value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="Optional — the words that made you notice" />
      </Field>
      <Field label="Your observation">
        <textarea rows={3} autoFocus value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) save(); }} placeholder="In your own words… (Ctrl+Enter to save)" />
      </Field>
      <div className="form-grid">
        <Field label="Code / label">
          <input list="code-options" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. Social validation" />
          <datalist id="code-options">{codes.map((entry) => <option key={entry} value={entry} />)}</datalist>
        </Field>
        <Field label="Guide question (optional)">
          <select value={questionId} onChange={(event) => setQuestionId(event.target.value)}>
            <option value="">—</option>
            {questions.map((question) => <option key={question.id} value={question.id}>{question.sectionTitle}: {question.text.slice(0, 70)}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
