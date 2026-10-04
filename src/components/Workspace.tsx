import { ArrowLeft, Check, CloudOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Study } from "../../shared/types";
import { allQuestions } from "../../shared/util";
import { api } from "../api";
import { useApp } from "../ui";
import { type SaveState, type UpdateStudy, useStudy } from "../useStudy";
import { GridView } from "../views/GridView";
import { InferenceView } from "../views/InferenceView";
import { SegmentsView } from "../views/SegmentsView";
import { SessionsView } from "../views/SessionsView";
import { SetupView } from "../views/SetupView";
import { ToplineView } from "../views/ToplineView";

export type Tab = "setup" | "sessions" | "grid" | "segments" | "inference" | "topline";
export const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "sessions", label: "Sessions" },
  { id: "grid", label: "Analysis grid" },
  { id: "segments", label: "Segments" },
  { id: "inference", label: "Inference" },
  { id: "topline", label: "Topline" },
];

export type TranscriptIndex = Record<string, { lines: number; source: string; updatedAt: string }>;

export type ViewProps = {
  study: Study;
  update: UpdateStudy;
  flush: () => Promise<void>;
  transcriptIndex: TranscriptIndex;
  refreshTranscripts: () => Promise<void>;
  goTo: (tab: Tab, focus?: { participantId?: string; time?: number | null }) => void;
  focus: { participantId?: string; time?: number | null } | null;
};

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="save-state"><Loader2 size={13} className="spin" /> Saving…</span>;
  if (state === "unsaved") return <span className="save-state">Unsaved changes</span>;
  if (state === "error") return <span className="save-state bad"><CloudOff size={13} /> Not saved — retrying on next change</span>;
  return <span className="save-state ok"><Check size={13} /> Saved on this computer</span>;
}

export function Workspace({ studyId, tab, onTab, onExit }: { studyId: string; tab: Tab; onTab: (tab: Tab) => void; onExit: () => void }) {
  const { notify } = useApp();
  const onError = useCallback((message: string) => notify(message, "error"), [notify]);
  const { study, loadError, saveState, update, flush } = useStudy(studyId, onError);
  const [transcriptIndex, setTranscriptIndex] = useState<TranscriptIndex>({});
  const [focus, setFocus] = useState<ViewProps["focus"]>(null);

  const refreshTranscripts = useCallback(async () => {
    try { setTranscriptIndex(await api.transcriptIndex(studyId)); } catch { /* shown elsewhere */ }
  }, [studyId]);
  useEffect(() => { void refreshTranscripts(); }, [refreshTranscripts]);

  if (loadError) return <div className="center-message"><p>{loadError}</p><button className="btn secondary" onClick={onExit}>Back to studies</button></div>;
  if (!study) return <div className="center-message"><Loader2 className="spin" /> Loading study…</div>;

  const questions = allQuestions(study.guide).length;
  const withTranscript = study.participants.filter((participant) => transcriptIndex[participant.id]?.lines).length;
  const filledCells = Object.values(study.grid).reduce((sum, row) => sum + Object.values(row).filter((cell) => cell.summary || cell.quotes.length).length, 0);
  const hints: Record<Tab, string> = {
    setup: `${study.segments.length} segments · ${questions} questions · ${study.participants.length} people`,
    sessions: `${withTranscript}/${study.participants.length} transcripts`,
    grid: `${filledCells}/${questions * study.participants.length} cells`,
    segments: `${Object.keys(study.segmentReports).length}/${study.segments.length} written`,
    inference: `${study.observations.length} notes · ${study.clusters.length} clusters`,
    topline: study.topline.body || study.topline.intro ? "Drafting" : "Not started",
  };

  const goTo: ViewProps["goTo"] = (next, nextFocus) => {
    setFocus(nextFocus ?? null);
    onTab(next);
  };

  const props: ViewProps = { study, update, flush, transcriptIndex, refreshTranscripts, goTo, focus };

  return (
    <div className="workspace">
      <div className="study-banner">
        <div className="study-title">
          <button className="btn ghost small" onClick={async () => { await flush(); onExit(); }}><ArrowLeft size={15} /> Studies</button>
          <input className="study-name" value={study.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} aria-label="Study name" />
          {study.design.client && <span className="muted-text">{study.design.client}</span>}
        </div>
        <SaveIndicator state={saveState} />
      </div>

      {study.demo && (
        <div className="demo-banner">
          <strong>Demo study.</strong> Fictional data, with every step already filled in. Click around, edit anything, try the AI buttons.
          Delete it from the <button className="link-btn" onClick={async () => { await flush(); onExit(); }}>Studies page</button> (bin icon) when you're done.
        </div>
      )}

      <nav className="phase-tabs" aria-label="Study workflow">
        {TABS.map((entry, index) => (
          <button key={entry.id} className={`phase-tab ${tab === entry.id ? "active" : ""}`} onClick={() => goTo(entry.id)}>
            <span className="step-no">{index + 1}</span>
            <span className="tab-text"><strong>{entry.label}</strong><small>{hints[entry.id]}</small></span>
          </button>
        ))}
      </nav>

      <div className="phase-body">
        {tab === "setup" && <SetupView {...props} />}
        {tab === "sessions" && <SessionsView {...props} />}
        {tab === "grid" && <GridView {...props} />}
        {tab === "segments" && <SegmentsView {...props} />}
        {tab === "inference" && <InferenceView {...props} />}
        {tab === "topline" && <ToplineView {...props} />}
      </div>
    </div>
  );
}
