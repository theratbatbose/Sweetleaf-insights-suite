import { ArrowRight, GripVertical, Link2, StickyNote, Tag, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Cluster, RelationshipEndpoint } from "../../shared/types";
import { formatTime, makeId } from "../../shared/util";
import { api } from "../api";
import type { ViewProps } from "../components/Workspace";
import { AiButton, Button, EmptyState, useAction } from "../ui";

const OBS_W = 220;
const CLUSTER_W = 260;

export function InferenceView({ study, update, flush, goTo }: ViewProps) {
  const action = useAction();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedObs, setSelectedObs] = useState<string[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [segmentLens, setSegmentLens] = useState<string>("all");
  const [mode, setMode] = useState<"move" | "lasso" | "connect">("move");
  const [drag, setDrag] = useState<{ kind: "obs" | "cluster"; id: string; dx: number; dy: number } | null>(null);
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [connectFrom, setConnectFrom] = useState<RelationshipEndpoint | null>(null);
  const [editingRel, setEditingRel] = useState<string | null>(null);
  // A drag ends with a click event; ignore that click so dragging doesn't toggle selection.
  const moved = useRef(false);

  const participantOf = (id: string) => study.participants.find((participant) => participant.id === id);
  const segmentOf = (participantId: string) => study.segments.find((segment) => segment.id === participantOf(participantId)?.segmentId);

  const point = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left + canvasRef.current!.scrollLeft, y: event.clientY - rect.top + canvasRef.current!.scrollTop };
  };

  const width = Math.max(1200, ...study.observations.map((o) => o.x + OBS_W + 60), ...study.clusters.map((c) => c.x + CLUSTER_W + 60));
  const height = Math.max(760, ...study.observations.map((o) => o.y + 220), ...study.clusters.map((c) => c.y + 260));

  const beginDrag = (kind: "obs" | "cluster", id: string, event: React.PointerEvent) => {
    if (mode !== "move" || (event.target as HTMLElement).closest("input,textarea,button")) return;
    const item = kind === "obs" ? study.observations.find((o) => o.id === id) : study.clusters.find((c) => c.id === id);
    if (!item) return;
    const p = point(event);
    canvasRef.current?.setPointerCapture(event.pointerId);
    moved.current = false;
    setDrag({ kind, id, dx: p.x - item.x, dy: p.y - item.y });
    event.stopPropagation();
  };

  const onMove = (event: React.PointerEvent) => {
    const p = point(event);
    if (drag) {
      moved.current = true;
      const x = Math.max(8, p.x - drag.dx);
      const y = Math.max(8, p.y - drag.dy);
      update((current) => drag.kind === "obs"
        ? { ...current, observations: current.observations.map((o) => o.id === drag.id ? { ...o, x, y } : o) }
        : { ...current, clusters: current.clusters.map((c) => c.id === drag.id ? { ...c, x, y } : c) });
    } else if (lasso) {
      setLasso({ ...lasso, x1: p.x, y1: p.y });
    }
  };

  const onUp = () => {
    if (lasso) {
      const [left, right] = [Math.min(lasso.x0, lasso.x1), Math.max(lasso.x0, lasso.x1)];
      const [top, bottom] = [Math.min(lasso.y0, lasso.y1), Math.max(lasso.y0, lasso.y1)];
      const hits = study.observations.filter((o) => o.x + OBS_W / 2 >= left && o.x + OBS_W / 2 <= right && o.y + 50 >= top && o.y + 50 <= bottom).map((o) => o.id);
      setSelectedObs((ids) => [...new Set([...ids, ...hits])]);
      setLasso(null);
      setMode("move");
    }
    setDrag(null);
  };

  const clickEndpoint = (endpoint: RelationshipEndpoint) => {
    if (!connectFrom) return setConnectFrom(endpoint);
    if (connectFrom.id === endpoint.id) return setConnectFrom(null);
    const relationship = { id: makeId("r"), from: connectFrom, to: endpoint, note: "relates to" };
    update((current) => ({ ...current, connections: [...current.connections, relationship] }));
    setEditingRel(relationship.id);
    setConnectFrom(null);
    setMode("move");
  };

  const center = (endpoint: RelationshipEndpoint) => {
    if (endpoint.kind === "obs") {
      const o = study.observations.find((entry) => entry.id === endpoint.id);
      return o ? { x: o.x + OBS_W / 2, y: o.y + 60 } : null;
    }
    const c = study.clusters.find((entry) => entry.id === endpoint.id);
    return c ? { x: c.x + CLUSTER_W / 2, y: c.y + 80 } : null;
  };

  const createCluster = (title = "New cluster", thought = "", observationIds = selectedObs, offset = 0) => {
    const cluster: Cluster = {
      id: makeId("c"), title, thought, observationIds,
      x: Math.max(980, ...study.observations.map((o) => o.x + OBS_W + 40)),
      y: 30 + (study.clusters.length + offset) * 250,
    };
    return cluster;
  };

  const updateCluster = (id: string, patch: Partial<Cluster>) => update((current) => ({ ...current, clusters: current.clusters.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  const cluster = study.clusters.find((entry) => entry.id === selectedCluster) ?? null;

  if (!study.observations.length && !study.clusters.length) {
    return (
      <EmptyState icon={<StickyNote size={28} />} title="Nothing on the canvas yet">
        <p>Notes you log while reviewing sessions appear here as cards. Group them into clusters to build insights.</p>
        <Button variant="primary" onClick={() => goTo("sessions")}>Go to Sessions</Button>
      </EmptyState>
    );
  }

  return (
    <div className="inference">
      <div className="toolbar">
        <div><div className="eyebrow">Inference</div><h2>Make meaning from what you noticed.</h2></div>
        <div className="row-actions">
          <button className={`btn secondary ${mode === "lasso" ? "active" : ""}`} onClick={() => setMode(mode === "lasso" ? "move" : "lasso")}>⌁ Lasso</button>
          <button className={`btn secondary ${mode === "connect" ? "active" : ""}`} onClick={() => { setMode(mode === "connect" ? "move" : "connect"); setConnectFrom(null); }}><Link2 size={15} /> Connect</button>
          <Button disabled={!selectedObs.length} onClick={() => {
            const created = createCluster();
            update((current) => ({ ...current, clusters: [...current.clusters, created] }));
            setSelectedCluster(created.id);
            setSelectedObs([]);
          }} icon={<StickyNote size={15} />}>Cluster selected ({selectedObs.length})</Button>
          <AiButton onClick={action(async () => {
            await flush();
            const { clusters } = await api.suggestClusters(study.id);
            const created = clusters.map((entry, index) => createCluster(entry.title, entry.thought, entry.observationIds, index));
            update((current) => ({ ...current, clusters: [...current.clusters, ...created] }));
          }, "Suggested clusters added on the right. Edit, merge or delete them.")}>Suggest clusters</AiButton>
        </div>
      </div>

      <div className="inference-shell">
        <div
          ref={canvasRef}
          className={`canvas mode-${mode}`}
          onPointerDown={(event) => {
            if (mode === "lasso") {
              const p = point(event);
              canvasRef.current?.setPointerCapture(event.pointerId);
              setLasso({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            } else if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("canvas-inner")) {
              setSelectedObs([]);
              setSelectedCluster(null);
            }
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="canvas-inner" style={{ width, height }}>
            <svg className="relationship-layer" width={width} height={height}>
              {study.clusters.flatMap((c) => c.observationIds.map((id) => {
                const from = center({ kind: "obs", id });
                const to = center({ kind: "cluster", id: c.id });
                return from && to ? <line key={`${c.id}-${id}`} className={`member-line ${selectedCluster === c.id ? "on" : ""}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> : null;
              }))}
              {study.connections.map((rel) => {
                const from = center(rel.from);
                const to = center(rel.to);
                if (!from || !to) return null;
                return <line key={rel.id} className="rel-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
              })}
            </svg>
            {study.connections.map((rel) => {
              const from = center(rel.from);
              const to = center(rel.to);
              if (!from || !to) return null;
              return (
                <div key={rel.id} className="relationship-note" style={{ left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 }} onClick={() => setEditingRel(rel.id)}>
                  {editingRel === rel.id ? (
                    <>
                      <input autoFocus value={rel.note} onChange={(event) => update((current) => ({ ...current, connections: current.connections.map((r) => r.id === rel.id ? { ...r, note: event.target.value } : r) }))}
                        onBlur={() => setEditingRel(null)} onKeyDown={(event) => { if (event.key === "Enter") setEditingRel(null); }} />
                      <button title="Delete link" onMouseDown={(event) => { event.preventDefault(); update((current) => ({ ...current, connections: current.connections.filter((r) => r.id !== rel.id) })); setEditingRel(null); }}><X size={12} /></button>
                    </>
                  ) : <span>{rel.note}</span>}
                </div>
              );
            })}

            {study.observations.map((o) => {
              const segment = segmentOf(o.participantId);
              const dimmed = segmentLens !== "all" && segment?.id !== segmentLens;
              const inCluster = cluster?.observationIds.includes(o.id);
              return (
                <div
                  key={o.id}
                  className={`canvas-observation ${selectedObs.includes(o.id) ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${inCluster ? "in-cluster" : ""}`}
                  style={{ left: o.x, top: o.y, borderTopColor: segment?.color ?? "#bbb", width: OBS_W }}
                  onPointerDown={(event) => beginDrag("obs", o.id, event)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (moved.current) { moved.current = false; return; }
                    if (mode === "connect") clickEndpoint({ kind: "obs", id: o.id });
                    else if (mode === "move") setSelectedObs((ids) => ids.includes(o.id) ? ids.filter((id) => id !== o.id) : [...ids, o.id]);
                  }}
                >
                  <div className="card-handle"><GripVertical size={13} /><span>{participantOf(o.participantId)?.code ?? "?"}{o.time !== null ? ` · ${formatTime(o.time)}` : ""}</span></div>
                  {o.code && <span className="tag"><Tag size={10} /> {o.code}</span>}
                  <p>{o.note}</p>
                  {o.quote && <button className="quote-link" onClick={(event) => { event.stopPropagation(); goTo("sessions", { participantId: o.participantId, time: o.time }); }}>“{o.quote.length > 80 ? `${o.quote.slice(0, 80)}…` : o.quote}”</button>}
                </div>
              );
            })}

            {study.clusters.map((c) => (
              <div
                key={c.id}
                className={`canvas-cluster ${selectedCluster === c.id ? "selected" : ""}`}
                style={{ left: c.x, top: c.y, width: CLUSTER_W }}
                onPointerDown={(event) => beginDrag("cluster", c.id, event)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (moved.current) { moved.current = false; return; }
                  if (mode === "connect") clickEndpoint({ kind: "cluster", id: c.id });
                  else {
                    setSelectedCluster(c.id);
                    if (selectedObs.length) {
                      updateCluster(c.id, { observationIds: [...new Set([...c.observationIds, ...selectedObs])] });
                      setSelectedObs([]);
                    }
                  }
                }}
              >
                <div className="cluster-head"><span>Cluster · {c.observationIds.length} notes</span>
                  <button className="icon-btn small danger" title="Delete cluster" onClick={(event) => {
                    event.stopPropagation();
                    if (!window.confirm(`Delete cluster “${c.title}”? The notes stay on the canvas.`)) return;
                    update((current) => ({
                      ...current,
                      clusters: current.clusters.filter((entry) => entry.id !== c.id),
                      connections: current.connections.filter((r) => r.from.id !== c.id && r.to.id !== c.id),
                      topline: { ...current.topline, blocks: current.topline.blocks.filter((id) => id !== c.id) },
                    }));
                  }}><Trash2 size={13} /></button>
                </div>
                <textarea className="cluster-title" rows={1} value={c.title} onChange={(event) => updateCluster(c.id, { title: event.target.value.replace(/\n/g, " ") })} aria-label="Cluster title" />
                <textarea value={c.thought} placeholder="The insight, in one or two sentences…" onChange={(event) => updateCluster(c.id, { thought: event.target.value })} aria-label="Cluster insight" />
                <div className="cluster-foot">
                  <span>{study.topline.blocks.includes(c.id) ? "In topline" : ""}</span>
                  <button onClick={(event) => {
                    event.stopPropagation();
                    update((current) => ({ ...current, topline: { ...current.topline, blocks: current.topline.blocks.includes(c.id) ? current.topline.blocks : [...current.topline.blocks, c.id] } }));
                  }}><ArrowRight size={13} /> Topline</button>
                </div>
              </div>
            ))}

            {lasso && <div className="lasso-rectangle" style={{ left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0) }} />}
          </div>
        </div>

        <aside className="inference-side">
          <div className="side-card">
            <div className="eyebrow">Segment lens</div>
            <div className="lens-list">
              <button className={segmentLens === "all" ? "active" : ""} onClick={() => setSegmentLens("all")}>All segments</button>
              {study.segments.map((segment) => (
                <button key={segment.id} className={segmentLens === segment.id ? "active" : ""} onClick={() => setSegmentLens(segment.id)}>
                  <span><span className="dot" style={{ background: segment.color }} /> {segment.name}</span>
                  <span>{study.observations.filter((o) => segmentOf(o.participantId)?.id === segment.id).length}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="side-card">
            <div className="eyebrow">How to</div>
            <p>{mode === "connect" ? (connectFrom ? "Now click the second card." : "Click a card, then another, to link them.")
              : mode === "lasso" ? "Drag a box around notes to select them."
              : "Drag cards to arrange. Click notes to select, then “Cluster selected” — or click an existing cluster to add them to it."}</p>
          </div>
          {cluster && (
            <div className="side-card">
              <div className="eyebrow">Selected cluster</div>
              <h3>{cluster.title}</h3>
              <ul className="member-list">
                {cluster.observationIds.map((id) => {
                  const o = study.observations.find((entry) => entry.id === id);
                  return o ? <li key={id}><span>{participantOf(o.participantId)?.code}: {o.note}</span><button className="icon-btn small" title="Remove from cluster" onClick={() => updateCluster(cluster.id, { observationIds: cluster.observationIds.filter((x) => x !== id) })}><X size={12} /></button></li> : null;
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
