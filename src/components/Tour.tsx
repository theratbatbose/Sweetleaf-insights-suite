import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import type { Tab } from "./Workspace";

export type TourStep = {
  tab: Tab;
  /** CSS selector of the element to spotlight; omit for a centred message */
  target?: string;
  title: string;
  body: string;
};

export const TOUR_DONE_KEY = "sweetleaf-tour-done";
export const TOUR_START_KEY = "sweetleaf-start-tour";

const tourFlag = {
  get(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* private mode */ } },
  remove(key: string) { try { window.localStorage.removeItem(key); } catch { /* private mode */ } },
};
export { tourFlag };

/** A guided walkthrough of the demo study, one highlighted part of the screen at a time. */
export const DEMO_TOUR: TourStep[] = [
  { tab: "setup", title: "Welcome to the demo study 👋", body: "This two-minute tour walks through a finished, fictional study: four interviews about tea-time snacking. Use Next (or the → key) to move on. You can leave at any time." },
  { tab: "setup", target: "[data-tour=tabs]", title: "Six steps, left to right", body: "Each tab is one stage of a qual project: Setup → Sessions → Analysis grid → Segments → Inference → Topline. The small text under each tab shows your progress." },
  { tab: "setup", target: "[data-tour=guide-structure]", title: "Start with your documents", body: "Upload the brief, screener and discussion guide as Word or PDF files. Sweetleaf turns the guide into a list of questions, with AI or without." },
  { tab: "setup", target: "[data-tour=guide]", title: "Your guide becomes the framework", body: "Every question here becomes a row in the analysis grid. Edit, reorder or delete freely." },
  { tab: "setup", target: "[data-tour=people]", title: "Participants and segments", body: "One row per interview. Import your recruitment sheet from Excel; the segment (cut) column groups people so you can compare them." },
  { tab: "sessions", target: "[data-tour=people-list]", title: "One page per interview", body: "Pick a respondent to see their recording and transcript." },
  { tab: "sessions", target: "[data-tour=transcript]", title: "Read and listen", body: "Click a timestamp to jump the recording to that moment. Transcripts can be in Hindi, Hinglish, Tamil, English or a mix." },
  { tab: "sessions", target: "[data-tour=transcript] .transcript-line .line-note", title: "Capture what you notice", body: "Click this icon next to any line to log an observation. Or select a few words first to quote just those. Notes land on the Inference canvas." },
  { tab: "sessions", target: "[data-tour=bulk-import]", title: "Bring in all your files at once", body: "Select every transcript and recording together. Sweetleaf matches them to people using the file name, like “R01 Priya.docx”." },
  { tab: "grid", target: "[data-tour=grid]", title: "The analysis grid", body: "Respondents across, guide questions down: the classic debrief grid. Click any cell to read or edit it." },
  { tab: "grid", target: "blockquote.unverified", title: "Built-in quote check", body: "Every quote the AI suggests is checked against the transcript. Amber means it couldn't be found word for word. Never use it without checking." },
  { tab: "grid", target: "[data-tour=grid-fill]", title: "Let AI draft, then you review", body: "With AI connected, this fills empty cells from the transcripts. AI drafts are labelled, and your own writing is never overwritten." },
  { tab: "grid", target: "[data-tour=grid-excel]", title: "Take it to Excel", body: "Download the whole grid, formatted, to share with your team." },
  { tab: "segments", target: "[data-tour=segment-report]", title: "Compare your cuts", body: "A summary for each segment: recurring themes, differences, contradictions and key quotes. Draft it with AI or write it yourself." },
  { tab: "inference", target: "[data-tour=canvas]", title: "Make meaning", body: "Your notes become cards. Drag them around, group them into clusters and connect related ideas. AI can suggest clusters too." },
  { tab: "topline", target: "[data-tour=topline]", title: "Write the story", body: "Clusters drop into the topline as building blocks. Draft it with AI or write it yourself, in your own words." },
  { tab: "topline", target: "[data-tour=topline-word]", title: "Share it", body: "Download a Word document that's ready to polish and send." },
  { tab: "topline", title: "That's the whole flow 🎉", body: "Explore freely: nothing here is real, and you can't break it. When you're ready, go to Studies → New study. You can replay this tour any time from the yellow demo banner." },
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tour({ steps, index, onIndex, onClose, onTab, currentTab }: {
  steps: TourStep[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onTab: (tab: Tab) => void;
  currentTab: Tab;
}) {
  const step = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const last = index === steps.length - 1;

  // Show the right tab, wait for the element, scroll it into view, then follow it as the page moves.
  useEffect(() => {
    setReady(false);
    setRect(null);
    if (step.tab !== currentTab) onTab(step.tab);
    if (!step.target) { setReady(true); return; }
    let cancelled = false;
    let measureTimer: number | undefined;
    const started = Date.now();
    const find = () => {
      if (cancelled) return;
      const element = document.querySelector(step.target!) as HTMLElement | null;
      if (!element && Date.now() - started < 3000) { measureTimer = window.setTimeout(find, 100); return; }
      if (element) element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      measureTimer = window.setTimeout(() => { if (!cancelled) setReady(true); }, element ? 450 : 0);
    };
    find();
    return () => { cancelled = true; window.clearTimeout(measureTimer); };
  }, [index]);

  useLayoutEffect(() => {
    if (!ready || !step.target) return;
    let frame = 0;
    const measure = () => {
      const element = document.querySelector(step.target!) as HTMLElement | null;
      if (element) {
        const box = element.getBoundingClientRect();
        const pad = 6;
        const next = { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
        setRect((previous) => previous && Math.abs(previous.top - next.top) < 1 && Math.abs(previous.left - next.left) < 1 && Math.abs(previous.width - next.width) < 1 && Math.abs(previous.height - next.height) < 1 ? previous : next);
      } else {
        setRect(null);
      }
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [ready, index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") last ? onClose() : onIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("touring");
    return () => { window.removeEventListener("keydown", onKey); document.body.classList.remove("touring"); };
  }, [index, last]);

  // Place the card below the highlight if there is room, otherwise above; centred when there is no highlight.
  const cardWidth = Math.min(380, window.innerWidth - 32);
  let cardStyle: React.CSSProperties = { width: cardWidth, left: (window.innerWidth - cardWidth) / 2, top: Math.max(80, window.innerHeight / 2 - 120) };
  if (rect) {
    const cardHeight = 230;
    const below = rect.top + rect.height + 12;
    const roomBelow = window.innerHeight - below > cardHeight;
    const roomAbove = rect.top - cardHeight - 12 > 0;
    const top = roomBelow ? below : roomAbove ? rect.top - cardHeight - 12 : Math.max(16, window.innerHeight - cardHeight - 16);
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - cardWidth - 16);
    cardStyle = { width: cardWidth, left, top };
  }

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-label="Guided tour">
      {rect ? <div className="tour-spotlight" style={rect} /> : <div className="tour-dim" />}
      {(ready || !step.target) && (
        <div className="tour-card" style={cardStyle}>
          <div className="tour-top">
            <span className="tour-count">{index + 1} / {steps.length}</span>
            <button className="icon-btn small" onClick={onClose} aria-label="End tour"><X size={14} /></button>
          </div>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <div className="tour-dots">{steps.map((_, i) => <span key={i} className={i === index ? "on" : i < index ? "done" : ""} />)}</div>
          <div className="tour-actions">
            {index > 0 ? <button className="btn ghost small" onClick={() => onIndex(index - 1)}><ArrowLeft size={14} /> Back</button> : <button className="btn ghost small" onClick={onClose}>Skip tour</button>}
            <span className="spacer" />
            <button className="btn primary" autoFocus onClick={() => last ? onClose() : onIndex(index + 1)}>{last ? "Finish" : index === 0 ? "Start the tour" : "Next"} {!last && <ArrowRight size={14} />}</button>
          </div>
        </div>
      )}
    </div>
  );
}
