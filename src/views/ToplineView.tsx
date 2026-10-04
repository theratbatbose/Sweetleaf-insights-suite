import { ArrowDown, ArrowUp, Download, GripVertical, Link2, X } from "lucide-react";
import { useState } from "react";
import type { Topline } from "../../shared/types";
import { api } from "../api";
import type { ViewProps } from "../components/Workspace";
import { AiButton, useAction } from "../ui";

export function ToplineView({ study, update, flush }: ViewProps) {
  const action = useAction();
  const [dragging, setDragging] = useState<string | null>(null);
  const topline = study.topline;
  const setTopline = (patch: Partial<Topline>) => update((current) => ({ ...current, topline: { ...current.topline, ...patch } }));
  const addBlock = (id: string) => setTopline({ blocks: topline.blocks.includes(id) ? topline.blocks : [...topline.blocks, id] });
  const moveBlock = (index: number, delta: number) => {
    const blocks = [...topline.blocks];
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    setTopline({ blocks });
  };

  const download = (kind: "topline.docx" | "topline.md" | "backup.json") => async () => {
    await flush();
    window.location.href = api.exportUrl(study.id, kind);
  };

  return (
    <div className="topline-layout">
      <div className="topline-wrap">
        <div className="toolbar">
          <div><div className="eyebrow">Topline</div><h2>Write the story in your own words.</h2></div>
          <div className="row-actions">
            <AiButton onClick={action(async () => {
              if ((topline.intro.trim() || topline.body.trim()) && !window.confirm("Replace the current title, summary and body with an AI draft? Research blocks stay.")) return;
              await flush();
              const draft = await api.draftTopline(study.id);
              setTopline({ title: draft.title || topline.title, intro: draft.intro, body: draft.body });
            }, "Draft written from your clusters, segment views and grid syntheses. Edit it into your voice.")}>Draft from my analysis</AiButton>
            <button className="btn secondary" onClick={download("topline.docx")}><Download size={15} /> Word</button>
            <button className="btn secondary" onClick={download("topline.md")}><Download size={15} /> Markdown</button>
          </div>
        </div>

        <div className="topline-editor" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData("text/cluster");
          if (id) addBlock(id);
          setDragging(null);
        }}>
          <input className="topline-title" value={topline.title} placeholder="Headline insight" onChange={(event) => setTopline({ title: event.target.value })} aria-label="Topline title" />
          <textarea className="topline-intro" value={topline.intro} placeholder="Executive summary — the two or three sentences a busy client will read." onChange={(event) => setTopline({ intro: event.target.value })} />

          {topline.blocks.map((id, index) => {
            const cluster = study.clusters.find((entry) => entry.id === id);
            if (!cluster) return null;
            return (
              <div className="research-block" key={id}>
                <div className="research-block-label">
                  <span>Research thought</span>
                  <span className="row-actions">
                    <button onClick={() => moveBlock(index, -1)} title="Move up"><ArrowUp size={14} /></button>
                    <button onClick={() => moveBlock(index, 1)} title="Move down"><ArrowDown size={14} /></button>
                    <button onClick={() => setTopline({ blocks: topline.blocks.filter((entry) => entry !== id) })} title="Remove from topline"><X size={14} /></button>
                  </span>
                </div>
                <input className="block-title" value={cluster.title} onChange={(event) => update((current) => ({ ...current, clusters: current.clusters.map((c) => c.id === id ? { ...c, title: event.target.value } : c) }))} />
                <textarea value={cluster.thought} onChange={(event) => update((current) => ({ ...current, clusters: current.clusters.map((c) => c.id === id ? { ...c, thought: event.target.value } : c) }))} />
                <div className="research-block-source"><Link2 size={13} /> Linked to Inference cluster · {cluster.observationIds.length} notes</div>
              </div>
            );
          })}

          <div className={`topline-drop-zone ${dragging ? "ready" : ""}`}>{dragging ? "Release to add this research thought" : "Drag a research thought here from the right, or click it"}</div>

          <textarea className="prose-area" placeholder={"Continue writing here…\n\nUse “## Heading” for sections and “- ” for bullet points; they become proper headings and bullets in Word."} value={topline.body} onChange={(event) => setTopline({ body: event.target.value })} />
        </div>
      </div>

      <aside className="topline-side">
        <div className="writer-side-card">
          <div className="eyebrow">Research blocks</div>
          <h3>Your clusters</h3>
          <p>Synthesised thoughts from Inference. Drag or click to place them in the story.</p>
          <div className="block-list">
            {study.clusters.map((cluster) => (
              <button
                key={cluster.id}
                className={`drag-block ${topline.blocks.includes(cluster.id) ? "used" : ""}`}
                draggable
                onDragStart={(event) => { event.dataTransfer.setData("text/cluster", cluster.id); setDragging(cluster.id); }}
                onDragEnd={() => setDragging(null)}
                onClick={() => addBlock(cluster.id)}
              >
                <GripVertical size={15} />
                <div><strong>{cluster.title}</strong><span>{cluster.thought}</span></div>
              </button>
            ))}
            {!study.clusters.length && <p className="muted-text small">No clusters yet — create them on the Inference canvas.</p>}
          </div>
        </div>
        <div className="writer-side-card">
          <div className="eyebrow">Keep a copy</div>
          <p>The study backup contains everything except recordings: setup, transcripts, grid, notes and topline. Use it to move a study to another computer.</p>
          <button className="btn secondary small" onClick={download("backup.json")}><Download size={14} /> Study backup (.json)</button>
        </div>
      </aside>
    </div>
  );
}
