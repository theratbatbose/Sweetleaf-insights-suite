import { AlertTriangle, CheckCircle2, Download, ListChecks, Play, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GridCell, Participant, Quote, Transcript } from "../../shared/types";
import { allQuestions, formatTime, nowIso } from "../../shared/util";
import { api } from "../api";
import type { ViewProps } from "../components/Workspace";
import { AiButton, Button, EmptyState, Field, Modal, Progress, useAction, useApp } from "../ui";

type CellRef = { participantId: string; questionId: string };

export function GridView({ study, update, flush, transcriptIndex, goTo }: ViewProps) {
  const { notify, settings } = useApp();
  const action = useAction();
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [editing, setEditing] = useState<CellRef | null>(null);
  const [filling, setFilling] = useState<{ label: string; done: number; total: number } | null>(null);
  const [showQuotes, setShowQuotes] = useState(true);
  const questions = allQuestions(study.guide);

  const segmentOrder = new Map(study.segments.map((segment, index) => [segment.id, index]));
  const participants = [...study.participants]
    .filter((participant) => segmentFilter === "all" || participant.segmentId === segmentFilter)
    .sort((a, b) => (segmentOrder.get(a.segmentId ?? "") ?? 999) - (segmentOrder.get(b.segmentId ?? "") ?? 999));

  /** AI never overwrites cells the researcher wrote or reviewed. */
  const mergeCells = (participantId: string, cells: Record<string, GridCell>) => {
    update((current) => {
      const row = { ...(current.grid[participantId] ?? {}) };
      for (const [questionId, cell] of Object.entries(cells)) {
        const existing = row[questionId];
        if (!existing || existing.status === "ai") row[questionId] = cell;
      }
      return { ...current, grid: { ...current.grid, [participantId]: row } };
    });
  };

  const fillParticipants = async (targets: Participant[], onlyEmpty: boolean) => {
    const ready = targets.filter((participant) => transcriptIndex[participant.id]?.lines);
    if (!ready.length) return notify("None of these participants has a transcript yet. Add transcripts in Sessions.", "error");
    await flush();
    const jobs = ready.map((participant) => {
      const existing = study.grid[participant.id] ?? {};
      const questionIds = questions
        .filter((question) => onlyEmpty ? !existing[question.id] : !existing[question.id] || existing[question.id].status === "ai")
        .map((question) => question.id);
      return { participant, questionIds };
    }).filter((job) => job.questionIds.length);
    if (!jobs.length) return notify("Every cell for these participants is already filled.", "info");

    // Several respondents at once with hosted AI; one at a time for a model running on this PC.
    const concurrency = settings.llm.provider === "ollama" ? 1 : 3;
    let filled = 0;
    let finished = 0;
    let stop = false;
    const failures: string[] = [];
    const queue = [...jobs];
    setFilling({ label: jobs.slice(0, concurrency).map((job) => job.participant.code).join(", "), done: 0, total: jobs.length });
    const worker = async () => {
      while (!stop && queue.length) {
        const { participant, questionIds } = queue.shift()!;
        try {
          const { cells } = await api.fillGrid(study.id, participant.id, questionIds);
          mergeCells(participant.id, cells);
          filled += Object.keys(cells).length;
        } catch (error) {
          const message = (error as Error).message;
          failures.push(`${participant.code}: ${message}`);
          // Key, credit or model problems affect every request: stop instead of repeating the same error.
          if (/API key|no credit|billing|isn't available|Settings → AI/.test(message)) stop = true;
        }
        finished += 1;
        setFilling({ label: queue.slice(0, concurrency).map((job) => job.participant.code).join(", ") || "finishing", done: finished, total: jobs.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
    setFilling(null);
    await flush();
    if (failures.length) notify(`${failures.length} participant(s) could not be filled. ${failures[0]}`, "error");
    if (filled) notify(`Drafted ${filled} cells. AI drafts are marked — review them before sharing.`, "success");
  };

  if (!questions.length || !study.participants.length) {
    return (
      <EmptyState icon={<ListChecks size={28} />} title="The grid needs a discussion guide and participants">
        <p>Rows come from your discussion guide questions; columns are your participants. Set both up first.</p>
        <Button variant="primary" onClick={() => goTo("setup")}>Go to Setup</Button>
      </EmptyState>
    );
  }

  const totalCells = questions.length * study.participants.length;
  const filledCells = study.participants.reduce((sum, participant) => sum + questions.filter((question) => study.grid[participant.id]?.[question.id]).length, 0);
  const aiDrafts = study.participants.reduce((sum, participant) => sum + questions.filter((question) => study.grid[participant.id]?.[question.id]?.status === "ai").length, 0);

  return (
    <div className="grid-view">
      <div className="toolbar">
        <div>
          <div className="eyebrow">Analysis grid</div>
          <h2>{filledCells} of {totalCells} cells written{aiDrafts ? ` · ${aiDrafts} AI drafts to review` : ""}</h2>
        </div>
        <div className="row-actions">
          <select value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)} aria-label="Filter by segment">
            <option value="all">All segments</option>
            {study.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
          </select>
          <label className="toggle"><input type="checkbox" checked={showQuotes} onChange={(event) => setShowQuotes(event.target.checked)} /> Show quotes</label>
          <AiButton variant="primary" disabled={Boolean(filling)} onClick={() => fillParticipants(participants, true)}>Fill empty cells with AI</AiButton>
          <a className="btn secondary" href={api.exportUrl(study.id, "grid.xlsx")} onClick={() => { void flush(); }}><Download size={15} /> Excel</a>
        </div>
      </div>
      {filling && <div className="fill-status"><span>AI is reading transcripts — {filling.done} of {filling.total} respondents done{filling.done < filling.total ? ` (working on ${filling.label})` : ""}. You can keep working in other tabs.</span><Progress value={(filling.done + 0.3) / filling.total} /></div>}

      <div className="grid-scroll">
        <table className="analysis-grid">
          <thead>
            <tr>
              <th className="sticky-col q-head">Discussion guide</th>
              {participants.map((participant) => {
                const segment = study.segments.find((entry) => entry.id === participant.segmentId);
                const hasTranscript = Boolean(transcriptIndex[participant.id]?.lines);
                return (
                  <th key={participant.id} style={{ borderTopColor: segment?.color ?? "#bbb" }}>
                    <div className="col-head">
                      <button className="link-btn strong" onClick={() => goTo("sessions", { participantId: participant.id })}>{participant.code}</button>
                      <span>{participant.name}</span>
                      <small>{segment?.name ?? "No segment"}</small>
                      {hasTranscript
                        ? <AiButton size="small" disabled={Boolean(filling)} onClick={() => fillParticipants([participant], false)} title="Draft or redraft this column's AI cells">Fill column</AiButton>
                        : <small className="warn">No transcript</small>}
                    </div>
                  </th>
                );
              })}
              <th className="across-head">Across respondents</th>
            </tr>
          </thead>
          <tbody>
            {study.guide.map((section) => [
              <tr key={section.id} className="section-row"><td className="sticky-col" colSpan={1}>{section.title}</td><td colSpan={participants.length + 1} /></tr>,
              ...section.questions.map((question) => (
                <tr key={question.id}>
                  <td className="sticky-col question-cell">{question.text}</td>
                  {participants.map((participant) => {
                    const cell = study.grid[participant.id]?.[question.id];
                    return (
                      <td key={participant.id} className={`grid-cell ${cell ? cell.status : "empty"}`} onClick={() => setEditing({ participantId: participant.id, questionId: question.id })} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setEditing({ participantId: participant.id, questionId: question.id }); }}>
                        {cell ? (
                          <>
                            {cell.status === "ai" && <span className="chip ai">AI draft</span>}
                            {cell.summary && <p>{cell.summary}</p>}
                            {showQuotes && cell.quotes.map((quote, index) => (
                              <blockquote key={index} className={quote.verified ? "" : "unverified"}>
                                “{quote.text}”{quote.time !== null && <span className="qtime"> {formatTime(quote.time)}</span>}
                                {!quote.verified && <span className="qwarn" title="This quote was not found in the transcript. Check it before using."> <AlertTriangle size={12} /></span>}
                                {quote.translation && <span className="translation">{quote.translation}</span>}
                              </blockquote>
                            ))}
                          </>
                        ) : <span className="add-hint"><Plus size={13} /></span>}
                      </td>
                    );
                  })}
                  <td className="across-cell">
                    <textarea value={study.rowSynthesis[question.id] ?? ""} placeholder="Pattern across respondents…" onChange={(event) => update((current) => ({ ...current, rowSynthesis: { ...current.rowSynthesis, [question.id]: event.target.value } }))} />
                    <AiButton size="small" onClick={action(async () => {
                      await flush();
                      const { synthesis } = await api.rowSynthesis(study.id, question.id);
                      if (study.rowSynthesis[question.id]?.trim() && !window.confirm("Replace your existing synthesis for this row with the AI draft?")) return;
                      update((current) => ({ ...current, rowSynthesis: { ...current.rowSynthesis, [question.id]: synthesis } }));
                    })}>Synthesise row</AiButton>
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      {editing && (
        <CellEditor
          key={`${editing.participantId}-${editing.questionId}`}
          study={study}
          cellRef={editing}
          onClose={() => setEditing(null)}
          onSave={(cell) => {
            update((current) => {
              const row = { ...(current.grid[editing.participantId] ?? {}) };
              if (cell) row[editing.questionId] = cell;
              else delete row[editing.questionId];
              return { ...current, grid: { ...current.grid, [editing.participantId]: row } };
            });
          }}
          onRegenerate={async () => {
            await flush();
            const { cells } = await api.fillGrid(study.id, editing.participantId, [editing.questionId]);
            const cell = cells[editing.questionId];
            if (!cell) throw new Error("The AI found nothing on this question in the transcript.");
            return cell;
          }}
          onOpenSource={(time) => goTo("sessions", { participantId: editing.participantId, time })}
        />
      )}
    </div>
  );
}

function CellEditor({ study, cellRef, onClose, onSave, onRegenerate, onOpenSource }: {
  study: ViewProps["study"];
  cellRef: CellRef;
  onClose: () => void;
  onSave: (cell: GridCell | null) => void;
  onRegenerate: () => Promise<GridCell>;
  onOpenSource: (time: number | null) => void;
}) {
  const { notify } = useApp();
  const participant = study.participants.find((entry) => entry.id === cellRef.participantId)!;
  const question = allQuestions(study.guide).find((entry) => entry.id === cellRef.questionId)!;
  const original = study.grid[cellRef.participantId]?.[cellRef.questionId];
  const [summary, setSummary] = useState(original?.summary ?? "");
  const [quotes, setQuotes] = useState<Quote[]>(original?.quotes ?? []);
  const [status, setStatus] = useState<GridCell["status"]>(original?.status ?? "manual");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => { api.transcript(study.id, participant.id).then(setTranscript).catch(() => undefined); }, [study.id, participant.id]);

  const matches = useMemo(() => {
    if (!transcript || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return transcript.lines.filter((line) => line.text.toLowerCase().includes(q)).slice(0, 30);
  }, [transcript, query]);

  const commit = (nextStatus: GridCell["status"]) => {
    if (!summary.trim() && !quotes.length) { onSave(null); onClose(); return; }
    onSave({ summary: summary.trim(), quotes, status: nextStatus, updatedAt: nowIso() });
    onClose();
  };

  return (
    <Modal wide title={question.text} eyebrow={`${participant.code} · ${participant.name} · ${question.sectionTitle}`} onClose={onClose} footer={<>
      {original && <Button variant="danger" onClick={() => { onSave(null); onClose(); }} icon={<Trash2 size={14} />}>Clear cell</Button>}
      <span className="spacer" />
      <Button onClick={onClose}>Cancel</Button>
      {status === "ai" && <Button onClick={() => commit("ai")}>Keep as draft</Button>}
      <Button variant="primary" onClick={() => commit(status === "ai" ? "reviewed" : status === "reviewed" ? "reviewed" : "manual")} icon={<CheckCircle2 size={15} />}>{status === "ai" ? "Mark reviewed & save" : "Save"}</Button>
    </>}>
      <div className="cell-editor">
        <div>
          <Field label="Summary of what they said">
            <textarea rows={5} value={summary} onChange={(event) => { setSummary(event.target.value); if (status === "ai") setStatus("reviewed"); }} placeholder="Their answer, reasons and nuance, in your words" />
          </Field>
          <div className="field-label">Quotes</div>
          {quotes.map((quote, index) => (
            <div key={index} className={`quote-edit ${quote.verified ? "" : "unverified"}`}>
              <textarea rows={2} value={quote.text} onChange={(event) => setQuotes((list) => list.map((entry, i) => i === index ? { ...entry, text: event.target.value } : entry))} />
              <input value={quote.translation} placeholder="English translation (if needed)" onChange={(event) => setQuotes((list) => list.map((entry, i) => i === index ? { ...entry, translation: event.target.value } : entry))} />
              <div className="quote-meta">
                {quote.verified ? <span className="ok"><CheckCircle2 size={13} /> Found in transcript</span> : <span className="bad"><AlertTriangle size={13} /> Not found in transcript — verify before use</span>}
                {quote.time !== null && <button className="link-btn" onClick={() => onOpenSource(quote.time)}><Play size={12} /> {formatTime(quote.time)}</button>}
                <button className="link-btn danger" onClick={() => setQuotes((list) => list.filter((_, i) => i !== index))}>Remove</button>
              </div>
            </div>
          ))}
          {!quotes.length && <p className="muted-text small">Search the transcript on the right and click a line to add it as a quote.</p>}
          <div className="row-actions">
            <AiButton onClick={async () => {
              try {
                const cell = await onRegenerate();
                setSummary(cell.summary);
                setQuotes(cell.quotes);
                setStatus("ai");
              } catch (error) {
                notify((error as Error).message, "error");
              }
            }}>{original ? "Redraft with AI" : "Draft with AI"}</AiButton>
          </div>
        </div>
        <div className="cell-source">
          <div className="search-input"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={transcript ? "Search this transcript…" : "No transcript for this participant"} disabled={!transcript} /></div>
          <div className="source-results">
            {matches.map((line) => (
              <button key={line.id} className="source-line" onClick={() => setQuotes((list) => [...list, { text: line.text, time: line.start, translation: "", verified: true }])} title="Add as quote">
                <span className="line-time">{line.start !== null ? formatTime(line.start) : "—"}</span>
                <span>{line.speaker && <strong>{line.speaker}: </strong>}{line.text}</span>
              </button>
            ))}
            {transcript && query.trim().length >= 2 && !matches.length && <p className="muted-text small">No matches.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
