import { AlertTriangle, ArrowRight, Layers, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SegmentReport } from "../../shared/types";
import { allQuestions, formatTime, nowIso } from "../../shared/util";
import { api } from "../api";
import type { ViewProps } from "../components/Workspace";
import { AiButton, Button, EmptyState, Field, useAction } from "../ui";

const emptyReport = (): SegmentReport => ({ recurring: [], differences: "", contradictions: "", explore: "", excerpts: [], source: "manual", updatedAt: nowIso() });

export function SegmentsView({ study, update, flush, goTo }: ViewProps) {
  const action = useAction();
  const [selectedId, setSelectedId] = useState(study.segments[0]?.id ?? null);
  const segment = study.segments.find((entry) => entry.id === selectedId) ?? study.segments[0];

  if (!segment) {
    return (
      <EmptyState icon={<Layers size={28} />} title="No segments defined">
        <p>Segments (cuts) let you compare groups of respondents. Add them in Setup, or detect them from your screener.</p>
        <Button variant="primary" onClick={() => goTo("setup")}>Go to Setup</Button>
      </EmptyState>
    );
  }

  const members = study.participants.filter((participant) => participant.segmentId === segment.id);
  const report = study.segmentReports[segment.id];
  const questions = allQuestions(study.guide);
  const filled = members.reduce((sum, participant) => sum + questions.filter((question) => study.grid[participant.id]?.[question.id]).length, 0);
  const setReport = (patch: Partial<SegmentReport>) => update((current) => ({
    ...current,
    segmentReports: { ...current.segmentReports, [segment.id]: { ...(current.segmentReports[segment.id] ?? emptyReport()), ...patch, updatedAt: nowIso() } },
  }));

  return (
    <div className="segments">
      <aside className="side-list">
        <div className="side-label">Segments</div>
        {study.segments.map((entry) => (
          <button key={entry.id} className={`side-item ${entry.id === segment.id ? "selected" : ""}`} onClick={() => setSelectedId(entry.id)}>
            <strong><span className="dot" style={{ background: entry.color }} /> {entry.name}</strong>
            <small className={study.segmentReports[entry.id] ? "ok" : ""}>{study.participants.filter((p) => p.segmentId === entry.id).length} people · {study.segmentReports[entry.id] ? "written" : "not written"}</small>
          </button>
        ))}
      </aside>

      <div className="segment-main">
        <div className="report-head">
          <div>
            <div className="eyebrow">Cumulative segment view</div>
            <h2><span className="dot big" style={{ background: segment.color }} /> {segment.name}</h2>
            <p className="muted-text">{segment.description || "No description"}{segment.criteria ? ` · ${segment.criteria}` : ""}</p>
            <div className="pills">{members.map((member) => <button key={member.id} className="pill-btn" onClick={() => goTo("sessions", { participantId: member.id })}>{member.code} {member.name}</button>)}</div>
          </div>
          <div className="row-actions">
            {report?.source === "ai" && <span className="chip ai">AI draft · edit freely</span>}
            <AiButton variant="primary" disabled={!members.length} onClick={action(async () => {
              if (report && !window.confirm("Replace the current segment view with a new AI draft?")) return;
              await flush();
              const { report: drafted } = await api.segmentReport(study.id, segment.id);
              update((current) => ({ ...current, segmentReports: { ...current.segmentReports, [segment.id]: drafted } }));
            }, "Segment view drafted from the grid and your notes.")}>{report ? "Redraft with AI" : "Draft with AI"}</AiButton>
            {!report && <Button onClick={() => setReport({})}>Write manually</Button>}
          </div>
        </div>
        {!members.length && <p className="hint-box">No participants are assigned to this segment yet — assign them in Setup → Participants.</p>}
        {members.length > 0 && filled === 0 && <p className="hint-box">The AI draft works best after the analysis grid is filled for these respondents. Without it, the AI reads raw transcripts.</p>}

        {report && (
          <div className="report-grid">
            <section className="report-section">
              <Field label="Recurring themes" hint="Comma-separated">
                <input value={report.recurring.join(", ")} onChange={(event) => setReport({ recurring: event.target.value.split(",").map((item) => item.trimStart()).filter((item, index, list) => item || index === list.length - 1) })} />
              </Field>
              <div className="topic-chips">{report.recurring.filter((item) => item.trim()).map((item) => <span key={item}>{item.trim()}</span>)}</div>
            </section>
            <section className="report-section">
              <Field label="Differences (within segment and vs others)"><textarea rows={5} value={report.differences} onChange={(event) => setReport({ differences: event.target.value })} /></Field>
            </section>
            <section className="report-section wide">
              <div className="field-label">Key excerpts</div>
              <div className="excerpt-list">
                {report.excerpts.map((excerpt, index) => {
                  const participant = study.participants.find((entry) => entry.id === excerpt.participantId);
                  return (
                    <div key={index} className="excerpt-item">
                      <div className="excerpt-top">
                        <strong>{participant ? `${participant.code} · ${participant.name}` : "Unknown"}</strong>
                        <span>{formatTime(excerpt.time)}</span>
                      </div>
                      <p>“{excerpt.text}”</p>
                      {!excerpt.verified && <span className="bad small"><AlertTriangle size={12} /> Not found in transcript — verify</span>}
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => goTo("sessions", { participantId: excerpt.participantId, time: excerpt.time })}>View source <ArrowRight size={13} /></button>
                        <button className="link-btn danger" onClick={() => setReport({ excerpts: report.excerpts.filter((_, i) => i !== index) })}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
                {!report.excerpts.length && <p className="muted-text small">No excerpts yet. AI drafts pick representative quotes from your grid.</p>}
              </div>
            </section>
            <section className="report-section">
              <Field label="Contradictions / outliers"><textarea rows={4} value={report.contradictions} onChange={(event) => setReport({ contradictions: event.target.value })} /></Field>
            </section>
            <section className="report-section">
              <Field label="Areas to explore"><textarea rows={4} value={report.explore} onChange={(event) => setReport({ explore: event.target.value })} /></Field>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
