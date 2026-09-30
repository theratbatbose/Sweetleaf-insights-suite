import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FolderOpen,
  GripVertical,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Tag,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type Phase = "Observation" | "Inference" | "Topline";

type Participant = {
  id: string;
  name: string;
  city: string;
  age: number | null;
  cut: string;
  profile: string;
  session: string;
};

type Observation = {
  id: string;
  participantId: string;
  code: string;
  note: string;
  quote: string;
  time: string;
  duration: number;
  x: number;
  y: number;
};

type Cluster = {
  id: string;
  title: string;
  thought: string;
  observationIds: string[];
  x: number;
  y: number;
};

type CutReport = {
  title: string;
  count: number;
  recurring: string[];
  excerpts: { participant: string; quote: string; time: string }[];
  differences: string;
  contradictions: string;
  explore: string;
};

type TranscriptSegment = { time: string; text: string };
type RelationshipEndpoint = { kind: "obs" | "cluster"; id: string };
type Relationship = { id: string; from: RelationshipEndpoint; to: RelationshipEndpoint; note: string };
type SearchResult = { key: string; label: string; kind: "Participant" | "Observation" | "Cluster"; id: string };

type SavedWorkspace = {
  participants?: Participant[];
  observations?: Observation[];
  clusters?: Cluster[];
  connections?: Relationship[];
  transcripts?: Record<string, TranscriptSegment[]>;
  toplineBlocks?: string[];
  toplineText?: string;
  toplineTitle?: string;
  toplineBody?: string;
};

const WORKSPACE_STORAGE_KEY = "sweetleaf-suite-workspace-v1";

function readSavedWorkspace(): SavedWorkspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as SavedWorkspace : {};
  } catch {
    return {};
  }
}

function downloadTextFile(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timeToMinutes(time: string) {
  const [minutes = "0", seconds = "0"] = time.split(":");
  return Number(minutes) + Number(seconds) / 60;
}

function formatMinutesAsTime(value: number) {
  const totalSeconds = Math.max(0, Math.round(value * 60));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function findFreeCanvasPosition(observations: Observation[], clusters: Cluster[], kind: "obs" | "cluster") {
  const width = kind === "obs" ? 215 : 248;
  const height = kind === "obs" ? 175 : 220;
  const gap = 24;

  for (let y = 24; y < 5000; y += 200) {
    for (let x = 24; x < 752; x += 280) {
      const overlapsObservation = observations.some((item) =>
        x < item.x + 215 + gap && x + width + gap > item.x &&
        y < item.y + 175 + gap && y + height + gap > item.y
      );
      const overlapsCluster = clusters.some((item) =>
        x < item.x + 248 + gap && x + width + gap > item.x &&
        y < item.y + 220 + gap && y + height + gap > item.y
      );
      if (!overlapsObservation && !overlapsCluster) return { x, y };
    }
  }

  return { x: 24, y: 5000 };
}

function parseTranscriptFile(contents: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = contents.replace(/\r/g, "").split("\n");
  const timestampPattern = /^\s*\[?(\d{1,2}:)?(\d{1,2}:\d{2})(?:[,.]\d+)?\]?\s*(.*)$/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || /^WEBVTT(?:\s|$)/i.test(line) || /^\d+$/.test(line) || /^(?:timestamp|time|start(?: time)?|timecode)\s*[,;\t]/i.test(line)) continue;
    const subtitleMatch = line.match(/^\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.]\d+\s*-->/);
    if (subtitleMatch) {
      const minute = Number(subtitleMatch[1] ?? 0) * 60 + Number(subtitleMatch[2]);
      const time = `${String(minute).padStart(2, "0")}:${String(Number(subtitleMatch[3])).padStart(2, "0")}`;
      const cueText = lines.slice(index + 1).map((cueLine) => cueLine.trim()).find((cueLine) => cueLine && !/^\d+$/.test(cueLine));
      if (cueText) segments.push({ time, text: cueText });
      continue;
    }
    const csvMatch = line.match(/^\"?(\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d+)?)\"?\s*,\s*\"?(.+?)\"?$/);
    if (csvMatch) {
      const timeParts = csvMatch[1].replace(",", ".").split(":");
      const normalizedTime = timeParts.length === 3
        ? `${String(Number(timeParts[0]) * 60 + Number(timeParts[1])).padStart(2, "0")}:${String(Number.parseFloat(timeParts[2])).padStart(2, "0")}`
        : `${String(Number(timeParts[0])).padStart(2, "0")}:${String(Number.parseFloat(timeParts[1])).padStart(2, "0")}`;
      const csvText = csvMatch[2].replace(/^\"|\"$/g, "").replace(/\"\"/g, "\"");
      if (csvText) segments.push({ time: normalizedTime, text: csvText });
      continue;
    }
    const match = line.match(timestampPattern);
    if (!match) continue;
    const [minutePart, secondPart] = match[2].split(":").map(Number);
    const minute = minutePart + (match[1] ? Number(match[1].slice(0, -1)) * 60 : 0);
    const time = `${String(minute).padStart(2, "0")}:${String(secondPart).padStart(2, "0")}`;
    const rawText = match[3].trim();
    let text = rawText.replace(/^[,;\s-]+/, "").replace(/^\"|\"$/g, "");
    if (rawText.includes("-->")) {
      const nextLine = lines[index + 1]?.trim();
      text = nextLine && !/^\d+$/.test(nextLine) ? nextLine : "";
    }
    if (text) segments.push({ time, text });
  }

  if (segments.length) return segments;
  return lines.map((line) => line.trim()).filter((line) => line && !/^WEBVTT(?:\s|$)/i.test(line) && !/^\d+$/.test(line)).map((text, index) => ({
    time: `${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}`,
    text,
  }));
}

const sampleTranscripts: Record<string, TranscriptSegment[]> = {
  P17: [
    { time: "14:03", text: "I usually discover things through people first. If somebody I know is already using it, it gives me a reason to pay attention." },
    { time: "14:21", text: "I'd rather see someone I actually know using it. Otherwise it feels a bit like a brand trying to convince me." },
    { time: "22:08", text: "I don't want to waste money on something I don't know I'll like. I think the social proof makes that feel safer." },
    { time: "30:19", text: "When someone tells me they used it and liked it, I don't need the brand to work that hard." },
    { time: "35:41", text: "I don't think that means I'm never interested in something new. It just means I want somebody else to go first." },
  ],
  P09: [
    { time: "09:42", text: "Usually my friends tell me what is worth trying first." },
    { time: "12:18", text: "I'll try it once if it looks interesting enough." },
  ],
  P12: [
    { time: "16:13", text: "If someone I know has had it, it feels less like an ad." },
    { time: "24:11", text: "I need to know why I should leave what already works." },
  ],
  P04: [
    { time: "07:13", text: "I don't really know anyone who buys it." },
    { time: "19:02", text: "It feels like something made for someone else." },
  ],
};

const initialParticipants: Participant[] = [
  { id: "P17", name: "Aarav", city: "Mumbai", age: 28, cut: "Loyalists", profile: "Heavy category user", session: "17 Jun · 14:00" },
  { id: "P09", name: "Maya", city: "Delhi", age: 25, cut: "Flirters", profile: "Occasional explorer", session: "18 Jun · 11:30" },
  { id: "P12", name: "Rehan", city: "Bengaluru", age: 32, cut: "Competitor Users", profile: "High-frequency competitor user", session: "18 Jun · 16:00" },
  { id: "P04", name: "Isha", city: "Pune", age: 23, cut: "Non-users", profile: "Category rejector", session: "19 Jun · 10:00" },
];

const initialObservations: Observation[] = [
  {
    id: "o1",
    participantId: "P17",
    code: "Social validation",
    note: "People trust peer recommendation more than brand recommendation.",
    quote: "I'd rather see someone I actually know using it.",
    time: "14:21",
    duration: 18,
    x: 90,
    y: 70,
  },
  {
    id: "o2",
    participantId: "P17",
    code: "Risk avoidance",
    note: "Trying something unfamiliar feels like a financial and social risk.",
    quote: "I don't want to waste money on something I don't know I'll like.",
    time: "22:08",
    duration: 22,
    x: 390,
    y: 110,
  },
  {
    id: "o3",
    participantId: "P09",
    code: "Discovery",
    note: "Friends act as a filter for new options before the participant looks for brands.",
    quote: "Usually my friends tell me what is worth trying first.",
    time: "09:42",
    duration: 17,
    x: 210,
    y: 360,
  },
  {
    id: "o4",
    participantId: "P12",
    code: "Credibility",
    note: "Familiarity with another person's experience gives the recommendation credibility.",
    quote: "If someone I know has had it, it feels less like an ad.",
    time: "16:13",
    duration: 20,
    x: 565,
    y: 325,
  },
];

const initialClusters: Cluster[] = [
  {
    id: "c1",
    title: "Social reassurance",
    thought: "People use other people's experiences to reduce the perceived risk of trying something unfamiliar.",
    observationIds: ["o1", "o3", "o4"],
    x: 730,
    y: 84,
  },
  {
    id: "c2",
    title: "Risk avoidance",
    thought: "Unfamiliar choices are evaluated through signals that make the decision feel safer and more credible.",
    observationIds: ["o2"],
    x: 760,
    y: 360,
  },
];

const initialConnections: Relationship[] = [
  { id: "r1", from: { kind: "cluster", id: "c1" }, to: { kind: "cluster", id: "c2" }, note: "reduces perceived risk" },
];

const cutReports: Record<string, CutReport> = {
  Loyalists: {
    title: "Loyalists",
    count: 8,
    recurring: ["Habit & familiarity", "Trust in known people", "Low tolerance for risk", "Brand as a shortcut"],
    excerpts: [
      { participant: "P17 · Aarav", quote: "I'd rather see someone I actually know using it.", time: "14:21" },
      { participant: "P06 · Nisha", quote: "Once something works, I don't need a reason to move.", time: "31:05" },
      { participant: "P02 · Kunal", quote: "I trust what has already proved itself to me.", time: "18:47" },
    ],
    differences: "Younger loyalists describe loyalty as social and identity-driven; older participants frame it more as reliability and habit.",
    contradictions: "A minority of loyalists still actively browse new products when the category feels culturally exciting.",
    explore: "Is loyalty primarily a functional shortcut, or a way of reducing decision risk?",
  },
  Flirters: {
    title: "Flirters",
    count: 6,
    recurring: ["Novelty", "Social discovery", "Low commitment experimentation", "Visual cues"],
    excerpts: [
      { participant: "P09 · Maya", quote: "Usually my friends tell me what is worth trying first.", time: "09:42" },
      { participant: "P11 · Tara", quote: "I'll try it once if it looks interesting enough.", time: "12:18" },
    ],
    differences: "Flirters respond to novelty more strongly than loyalists, but still rely on social validation to reduce the downside of trying something new.",
    contradictions: "High novelty seekers can become extremely loyal once a trial becomes part of routine.",
    explore: "What turns a low-commitment flirt into a repeat behaviour?",
  },
  "Competitor Users": {
    title: "Competitor Users",
    count: 5,
    recurring: ["Comparative evaluation", "Credibility", "Value scrutiny", "Switching friction"],
    excerpts: [
      { participant: "P12 · Rehan", quote: "If someone I know has had it, it feels less like an ad.", time: "16:13" },
      { participant: "P14 · Kabir", quote: "I need to know why I should leave what already works.", time: "24:11" },
    ],
    differences: "Competitor users compare brands through lived experience more than abstract claims.",
    contradictions: "A strong social recommendation can temporarily override a habitual preference.",
    explore: "Which social proof signals are strong enough to disrupt an established choice?",
  },
  "Non-users": {
    title: "Non-users",
    count: 5,
    recurring: ["Category uncertainty", "Low relevance", "Perceived risk", "Lack of social proof"],
    excerpts: [
      { participant: "P04 · Isha", quote: "I don't really know anyone who buys it.", time: "07:13" },
      { participant: "P08 · Sameer", quote: "It feels like something made for someone else.", time: "19:02" },
    ],
    differences: "Non-users are more likely to interpret the category through identity and relevance than through functional benefits.",
    contradictions: "Once introduced by a trusted person, resistance softens quickly.",
    explore: "Can social relevance create a bridge into a category that otherwise feels distant?",
  },
};

function App() {
  const [savedWorkspace] = useState(readSavedWorkspace);
  const [participants, setParticipants] = useState<Participant[]>(savedWorkspace.participants ?? initialParticipants);
  const [phase, setPhase] = useState<Phase>("Observation");
  const [selectedParticipantId, setSelectedParticipantId] = useState(savedWorkspace.participants?.[0]?.id ?? "P17");
  const [selectedCut, setSelectedCut] = useState("Loyalists");
  const [showCutReport, setShowCutReport] = useState(false);
  const [showObservationComposer, setShowObservationComposer] = useState(false);
  const [selectedTranscript, setSelectedTranscript] = useState("");
  const [observationNote, setObservationNote] = useState("");
  const [observationCode, setObservationCode] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [observations, setObservations] = useState<Observation[]>(savedWorkspace.observations ?? initialObservations);
  const [clusters, setClusters] = useState<Cluster[]>(savedWorkspace.clusters ?? initialClusters);
  const [connections, setConnections] = useState<Relationship[]>(savedWorkspace.connections ?? initialConnections);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptSegment[]>>(savedWorkspace.transcripts ?? sampleTranscripts);
  const [selectedObsIds, setSelectedObsIds] = useState<string[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>("c1");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showParticipantComposer, setShowParticipantComposer] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [toplineBlocks, setToplineBlocks] = useState<string[]>(savedWorkspace.toplineBlocks ?? ["c1"]);
  const [toplineTitle, setToplineTitle] = useState(savedWorkspace.toplineTitle ?? "The role of social proof in trial");
  const [toplineBody, setToplineBody] = useState(savedWorkspace.toplineBody ?? `The role of social proof is especially clear in the moments where participants are weighing risk against novelty.

What matters is not simply that people hear from others. It is that another person's lived experience makes an unfamiliar choice feel less uncertain.

The implication is that...`);


  const [newToplineText, setNewToplineText] = useState(
    savedWorkspace.toplineText ?? "The category is not discovered in isolation. Familiarity, social proof and the lived experience of other people make unfamiliar choices feel safer—and more credible."
  );

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        participants,
        observations,
        clusters,
        connections,
        transcripts,
        toplineBlocks,
        toplineText: newToplineText,
        toplineTitle,
        toplineBody,
      } satisfies SavedWorkspace));
    } catch {
      // Keep the app usable when browser storage is unavailable or full.
    }
  }, [participants, observations, clusters, connections, transcripts, toplineBlocks, newToplineText, toplineTitle, toplineBody]);

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId) ?? participants[0] ?? initialParticipants[0];
  const cutReport = cutReports[selectedCut] ?? cutReports.Loyalists;

  const currentObservations = observations.filter((o) => o.participantId === selectedParticipant.id);
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;

  const allSearchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return [
      ...participants.filter((p) => `${p.name} ${p.cut} ${p.profile}`.toLowerCase().includes(q)).map((p) => ({ key: `participant:${p.id}`, kind: "Participant" as const, id: p.id, label: `Participant · ${p.name}` })),
      ...observations.filter((o) => `${o.code} ${o.note} ${o.quote}`.toLowerCase().includes(q)).map((o) => ({ key: `observation:${o.id}`, kind: "Observation" as const, id: o.id, label: `Observation · ${o.code}` })),
      ...clusters.filter((c) => `${c.title} ${c.thought}`.toLowerCase().includes(q)).map((c) => ({ key: `cluster:${c.id}`, kind: "Cluster" as const, id: c.id, label: `Cluster · ${c.title}` })),
    ] satisfies SearchResult[];
  }, [search, participants, observations, clusters]);

  const handleTranscriptSelect = (quote: string, time: number) => {
    setSelectedTranscript(quote);
    setCurrentTime(time);
    setShowObservationComposer(true);
  };

  const importTranscript = (contents: string) => {
    const segments = parseTranscriptFile(contents);
    if (segments.length) {
      setTranscripts((previous) => ({ ...previous, [selectedParticipant.id]: segments }));
      setShowCutReport(false);
    } else {
      window.alert("No transcript text was found in that file. Please choose a non-empty TXT, SRT, VTT, or CSV file.");
    }
  };

  const addParticipant = (details: { name: string; city: string; age: number | null; cut: string }) => {
    const participant: Participant = {
      ...details,
      id: `P${Date.now().toString().slice(-5)}`,
      profile: "Research participant",
      session: "Session not set",
    };
    setParticipants((previous) => [...previous, participant]);
    setSelectedParticipantId(participant.id);
    setSelectedCut(details.cut);
    setShowCutReport(false);
    setShowParticipantComposer(false);
  };

  const downloadWorkspaceBackup = () => downloadTextFile("sweetleaf-workspace-backup.json", JSON.stringify({
    participants, observations, clusters, connections, transcripts, toplineBlocks, toplineText: newToplineText, toplineTitle, toplineBody,
  }, null, 2), "application/json");

  const restoreSampleWorkspace = () => {
    setParticipants(initialParticipants);
    setObservations(initialObservations);
    setClusters(initialClusters);
    setConnections(initialConnections);
    setTranscripts(sampleTranscripts);
    setToplineBlocks(["c1"]);
    setNewToplineText("The category is not discovered in isolation. Familiarity, social proof and the lived experience of other people make unfamiliar choices feel safer—and more credible.");
    setToplineTitle("The role of social proof in trial");
    setToplineBody(`The role of social proof is especially clear in the moments where participants are weighing risk against novelty.

What matters is not simply that people hear from others. It is that another person's lived experience makes an unfamiliar choice feel less uncertain.

The implication is that...`);
    setSelectedParticipantId("P17");
    setSelectedCut("Loyalists");
    setCurrentTime(0);
    setSelectedObsIds([]);
    setSelectedClusterId("c1");
    setPhase("Observation");
    setShowCutReport(false);
    setShowObservationComposer(false);
    setShowSettings(false);
  };

  const restoreWorkspaceBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as SavedWorkspace;
      if (!Array.isArray(backup.participants) || backup.participants.length === 0 || !Array.isArray(backup.observations) || !Array.isArray(backup.clusters)) {
        throw new Error("This file needs at least one participant and valid observation and cluster lists.");
      }
      setParticipants(backup.participants);
      setObservations(backup.observations);
      setClusters(backup.clusters);
      setConnections(backup.connections ?? []);
      setTranscripts(backup.transcripts ?? {});
      setToplineBlocks(backup.toplineBlocks ?? []);
      setNewToplineText(backup.toplineText ?? "");
      setToplineTitle(backup.toplineTitle ?? "Research topline");
      setToplineBody(backup.toplineBody ?? "");
      setSelectedParticipantId(backup.participants[0]?.id ?? "");
      setShowCutReport(false);
      setShowSettings(false);
    } catch (error) {
      window.alert(error instanceof Error ? `Backup could not be restored: ${error.message}` : "Backup could not be restored.");
    } finally {
      event.target.value = "";
    }
  };

  const openSearchResult = (item: SearchResult) => {
    if (item.kind === "Participant") {
      const participant = participants.find((entry) => entry.id === item.id);
      if (participant) {
        setSelectedParticipantId(participant.id);
        setCurrentTime(0);
        setShowCutReport(false);
        setPhase("Observation");
      }
    } else if (item.kind === "Observation") {
      const observation = observations.find((entry) => entry.id === item.id);
      if (observation) {
        setSelectedParticipantId(observation.participantId);
        setCurrentTime(timeToMinutes(observation.time));
        setShowCutReport(false);
        setPhase("Observation");
      }
    } else if (item.kind === "Cluster") {
      const cluster = clusters.find((entry) => entry.id === item.id);
      if (cluster) {
        setSelectedClusterId(cluster.id);
        setPhase("Inference");
      }
    }
    setSearchOpen(false);
    setSearch("");
  };

  const saveObservation = () => {
    if (!observationNote.trim()) return;
    const position = findFreeCanvasPosition(observations, clusters, "obs");
    const newObs: Observation = {
      id: `o${Date.now()}`,
      participantId: selectedParticipant.id,
      code: observationCode.trim() || "Unlabelled",
      note: observationNote.trim(),
      quote: selectedTranscript,
      time: formatMinutesAsTime(currentTime),
      duration: 18,
      ...position,
    };
    setObservations((prev) => [...prev, newObs]);
    setObservationNote("");
    setObservationCode("");
    setSelectedTranscript("");
    setShowObservationComposer(false);
  };

  const toggleObs = (id: string) => {
    setSelectedObsIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  };

  const createClusterFromSelection = () => {
    if (!selectedObsIds.length) return;
    const ids = [...selectedObsIds];
    const position = findFreeCanvasPosition(observations, clusters, "cluster");
    const cluster: Cluster = {
      id: `c${Date.now()}`,
      title: "New cluster",
      thought: "Add the researcher's synthesized thought here.",
      observationIds: ids,
      ...position,
    };
    setClusters((prev) => [...prev, cluster]);
    setSelectedClusterId(cluster.id);
    setSelectedObsIds([]);
  };

  const addToplineBlock = (clusterId: string) => {
    setToplineBlocks((ids) => ids.includes(clusterId) ? ids : [...ids, clusterId]);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand">Sweetleaf Suite</div>
            <div className="brand-sub">Research workbench</div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setSearchOpen(!searchOpen)} title="Search"><Search size={18} /></button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings"><Settings2 size={18} /></button>
          <div className="avatar">AB</div>
        </div>
      </header>

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-box">
            <Search size={17} />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search participants, observations, clusters..." />
            <button onClick={() => setSearchOpen(false)}><X size={17} /></button>
          </div>
          {search && (
            <div className="search-results">
              {allSearchResults.length ? allSearchResults.map((item) => <button className="search-result" key={item.key} onClick={() => openSearchResult(item)}>{item.label}</button>) : <div className="search-empty">No matches.</div>}
            </div>
          )}
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <section className="observation-modal settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><div className="eyebrow">Privacy & storage</div><h3>Your work stays in this browser.</h3></div>
              <button className="icon-btn" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={17} /></button>
            </div>
            <p className="settings-copy">This version saves imported transcripts, observations, clusters, and your topline on this device only. It does not upload your research data or share it with a team.</p>
            <input ref={backupInputRef} type="file" accept=".json,application/json" onChange={restoreWorkspaceBackup} hidden />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowSettings(false)}>Done</button>
              <button className="secondary-button" onClick={downloadWorkspaceBackup}>Download backup</button>
              <button className="secondary-button" onClick={() => backupInputRef.current?.click()}>Restore backup</button>
              <button className="secondary-button" onClick={() => {
                if (window.confirm("Delete saved Sweetleaf work from this browser and restore the sample study?")) {
                  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
                  restoreSampleWorkspace();
                }
              }}>Restore sample study</button>
            </div>
          </section>
        </div>
      )}

      {showParticipantComposer && <NewParticipantDialog onCreate={addParticipant} onClose={() => setShowParticipantComposer(false)} />}

      <main className="main-stage">
        <div className="study-banner">
          <div>
            <div className="eyebrow">Study</div>
            <h1>New Beverage Category</h1>
            <p>Example study workspace. Add participants and import transcripts to work with your own research.</p>
          </div>
          <div className="study-meta">
            <span>{participants.length} participants</span>
            <span>4 cuts</span>
            <span>Example study</span>
            <span className="local-pill">Saved in this browser</span>
          </div>
        </div>

        <div className="phase-tabs">
          {(["Observation", "Inference", "Topline"] as Phase[]).map((item) => (
            <button key={item} className={`phase-tab ${phase === item ? "active" : ""}`} onClick={() => setPhase(item)}>
              {item}
            </button>
          ))}
        </div>

        {phase === "Observation" && (
          <ObservationPhase
            participants={participants}
            onAddParticipant={() => setShowParticipantComposer(true)}
            participant={selectedParticipant}
            selectedParticipantId={selectedParticipantId}
            setSelectedParticipantId={setSelectedParticipantId}
            selectedCut={selectedCut}
            setSelectedCut={setSelectedCut}
            currentObservations={currentObservations}
            transcript={transcripts[selectedParticipant.id] ?? []}
            onImportTranscript={importTranscript}
            cutReport={cutReport}
            showCutReport={showCutReport}
            setShowCutReport={setShowCutReport}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            handleTranscriptSelect={handleTranscriptSelect}
            showComposer={showObservationComposer}
            selectedTranscript={selectedTranscript}
            observationNote={observationNote}
            setObservationNote={setObservationNote}
            observationCode={observationCode}
            setObservationCode={setObservationCode}
            saveObservation={saveObservation}
            setShowComposer={setShowObservationComposer}
          />
        )}

        {phase === "Inference" && (
          <InferencePhase
            participants={participants}
            observations={observations}
            clusters={clusters}
            connections={connections}
            setConnections={setConnections}
            selectedObsIds={selectedObsIds}
            toggleObs={toggleObs}
            createClusterFromSelection={createClusterFromSelection}
            selectedClusterId={selectedClusterId}
            setSelectedClusterId={setSelectedClusterId}
            addToplineBlock={addToplineBlock}
            setClusters={setClusters}
            setObservations={setObservations}
            selectedCut={selectedCut}
            setSelectedCut={setSelectedCut}
          />
        )}

        {phase === "Topline" && (
          <ToplinePhase
            clusters={clusters}
            toplineBlocks={toplineBlocks}
            setToplineBlocks={setToplineBlocks}
            newToplineText={newToplineText}
            setNewToplineText={setNewToplineText}
            toplineTitle={toplineTitle}
            setToplineTitle={setToplineTitle}
            toplineBody={toplineBody}
            setToplineBody={setToplineBody}
            setClusters={setClusters}
            removeToplineBlock={(id) => setToplineBlocks((ids) => ids.filter((x) => x !== id))}
          />
        )}
      </main>
    </div>
  );
}

function ObservationPhase(props: {
  participants: Participant[];
  onAddParticipant: () => void;
  participant: Participant;
  selectedParticipantId: string;
  setSelectedParticipantId: (id: string) => void;
  selectedCut: string;
  setSelectedCut: (cut: string) => void;
  currentObservations: Observation[];
  transcript: TranscriptSegment[];
  onImportTranscript: (contents: string) => void;
  cutReport: CutReport;
  showCutReport: boolean;
  setShowCutReport: (v: boolean) => void;
  currentTime: number;
  setCurrentTime: (v: number) => void;
  handleTranscriptSelect: (quote: string, time: number) => void;
  showComposer: boolean;
  selectedTranscript: string;
  observationNote: string;
  setObservationNote: (v: string) => void;
  observationCode: string;
  setObservationCode: (v: string) => void;
  saveObservation: () => void;
  setShowComposer: (v: boolean) => void;
}) {
  const {
    participant,
    selectedParticipantId,
    setSelectedParticipantId,
    selectedCut,
    setSelectedCut,
    currentObservations,
    transcript,
    onImportTranscript,
    cutReport,
    showCutReport,
    setShowCutReport,
    currentTime,
    setCurrentTime,
    handleTranscriptSelect,
    showComposer,
    selectedTranscript,
    observationNote,
    setObservationNote,
    observationCode,
    setObservationCode,
    saveObservation,
    setShowComposer,
  } = props;

  const timelineEnd = Math.max(
    44,
    ...transcript.map((line) => Math.ceil(timeToMinutes(line.time))),
    ...currentObservations.map((observation) => Math.ceil(timeToMinutes(observation.time)))
  );

  return (
    <div className="phase-body observation-layout">
      <aside className="left-panel">
        <div className="panel-section">
          <div className="panel-label">Study</div>
          <button className={`nav-item ${selectedCut === "All" ? "selected" : ""}`} onClick={() => { setSelectedCut("All"); setShowCutReport(false); }}>
            <FolderOpen size={16} /> All participants
          </button>
        </div>

        <div className="panel-section">
          <div className="panel-label">Cuts</div>
          {Object.keys(cutReports).map((cut) => (
            <button key={cut} className={`nav-item ${selectedCut === cut ? "selected" : ""}`} onClick={() => { setSelectedCut(cut); setShowCutReport(true); }}>
              <span className="cut-dot" />
              <span>{cut}</span>
              <span className="nav-count">{props.participants.filter((participant) => participant.cut === cut).length}</span>
            </button>
          ))}
        </div>

        <div className="panel-section">
          <div className="panel-label">Participants</div>
          <button className="nav-item" onClick={props.onAddParticipant}><Plus size={15} /> Add participant</button>
          {props.participants.map((p) => (
            <button key={p.id} className={`participant-item ${selectedParticipantId === p.id ? "selected" : ""}`} onClick={() => { setSelectedParticipantId(p.id); setCurrentTime(0); setShowCutReport(false); }}>
              <div className="mini-avatar">{p.name.slice(0, 1)}</div>
              <div>
                <strong>{p.id}</strong>
                <span>{p.name}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="observation-main">
        {!showCutReport ? (
          <>
            <div className="participant-header">
              <div>
                <div className="eyebrow">Participant</div>
                <h2>{participant.name} <span className="muted">{participant.id}</span></h2>
                <div className="participant-pills">
                  <span>{participant.age ?? "Age not recorded"}</span>
                  <span>{participant.city}</span>
                  <span>{participant.cut}</span>
                  <span>{participant.profile}</span>
                </div>
              </div>
              <div className="session-meta"><span>{participant.session}</span><span className="live-dot" /> Private browser workspace</div>
            </div>

            <div className="evidence-grid">
              <div className="video-card">
                <div className="video-header">
                  <span>Interview media</span>
                  <span>Not attached</span>
                </div>
                <div className="video-surface">
                  <div className="video-grid" />
                  <div className="video-center">
                    <FileText size={30} />
                    <span>Transcript workspace</span>
                    <small>Import a transcript to begin capturing evidence.</small>
                  </div>
                  <div className="video-overlay-title">{participant.name} · No recording attached</div>
                </div>
                <div className="timeline-wrap">
                  <div className="timeline-ruler">
                    {[0, 1, 2, 3, 4].map((mark) => <span key={mark}>{formatMinutesAsTime(timelineEnd * mark / 4)}</span>)}
                  </div>
                  <input className="timeline-slider" type="range" min="0" max={timelineEnd} step="0.01" value={Math.min(timelineEnd, currentTime)} onChange={(e) => setCurrentTime(Number(e.target.value))} aria-label="Transcript time position" />
                  <div className="timeline-dots">
                    {currentObservations.map((o) => {
                      const left = Math.min(97, Math.max(2, (timeToMinutes(o.time) / timelineEnd) * 100));
                      return <button key={o.id} className="timeline-dot" style={{ left: `${left}%` }} title={o.code} onClick={() => setCurrentTime(timeToMinutes(o.time))} />;
                    })}
                    <span className="playhead" style={{ left: `${(Math.min(timelineEnd, currentTime) / timelineEnd) * 100}%` }} />
                  </div>
                  <div className="video-controls">
                    <div>
                      <span>{formatMinutesAsTime(currentTime)} · transcript position</span>
                    </div>
                    <span className="control-caption">{transcript.length} transcript moments</span>
                  </div>
                </div>
              </div>

              <div className="transcript-card">
                <div className="card-title-row">
                  <div>
                    <span className="eyebrow">Transcript</span>
                    <h3>Interview transcript</h3>
                  </div>
                  <button className="subtle-button" onClick={() => downloadTextFile(`${participant.id}-transcript.txt`, transcript.map((line) => `${line.time} ${line.text}`).join("\n"))}><FileText size={15} /> Export</button>
                </div>
                <div className="transcript-scroll">
                  {transcript.map((line) => {
                    const minute = timeToMinutes(line.time);
                    return <TranscriptLine key={`${line.time}-${line.text}`} time={line.time} text={line.text} active={Math.abs(currentTime - minute) < 0.1} onClick={() => handleTranscriptSelect(line.text, minute)} />;
                  })}
                </div>
                <TranscriptImport participantId={participant.id} onImport={onImportTranscript} />
              </div>
            </div>

            <div className="observations-strip">
              <div className="strip-title">
                <div>
                  <span className="eyebrow">Your observations</span>
                  <h3>{currentObservations.length} captured moments</h3>
                </div>
                <div className="strip-actions">
                  <button className="subtle-button" onClick={() => {
                    const rows = [["participant", "time", "code", "note", "quote"], ...currentObservations.map((observation) => [observation.participantId, observation.time, observation.code, observation.note, observation.quote])];
                    const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, "\"\"")}"`).join(",")).join("\n");
                    downloadTextFile(`${participant.id}-observations.csv`, csv, "text/csv");
                  }}><FileText size={14} /> Export observations</button>
                  <button className="subtle-button" onClick={() => setShowComposer(true)}><Plus size={15} /> New observation</button>
                </div>
              </div>
              <div className="observation-mini-grid">
                {currentObservations.map((o) => (
                  <div key={o.id} className="observation-mini">
                    <div className="observation-mini-top"><span className="tag"><Tag size={11} /> {o.code}</span><span>{o.time}</span></div>
                    <p>{o.note}</p>
                    <div className="observation-source">{o.quote ? <><Video size={13} /> Transcript linked</> : "No transcript quote attached"}</div>
                  </div>
                ))}
              </div>
            </div>

            {showComposer && (
              <div className="modal-backdrop" onClick={() => setShowComposer(false)}>
                <div className="observation-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-head">
                    <div>
                      <div className="eyebrow">New observation</div>
                      <h3>Capture what you noticed.</h3>
                    </div>
                    <button className="icon-btn" onClick={() => setShowComposer(false)}><X size={17} /></button>
                  </div>
                  <div className="selected-evidence">
                    <div className="evidence-label"><StickyNote size={14} /> Selected evidence · {formatMinutesAsTime(currentTime)}</div>
                    <p>{selectedTranscript || "Select a transcript passage to anchor this observation."}</p>
                  </div>
                  <label>
                    <span>What did you notice?</span>
                    <textarea value={observationNote} onChange={(e) => setObservationNote(e.target.value)} placeholder="Write your interpretation in your own words..." autoFocus />
                  </label>
                  <label>
                    <span>Code / label</span>
                    <input value={observationCode} onChange={(e) => setObservationCode(e.target.value)} placeholder="e.g. Social validation" />
                  </label>
                  <div className="modal-actions">
                    <button className="secondary-button" onClick={() => setShowComposer(false)}>Cancel</button>
                    <button className="primary-button" onClick={saveObservation} disabled={!observationNote.trim()}>Log observation</button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <CutReportPanel
            cutReport={cutReport}
            availableParticipantIds={props.participants.map((entry) => entry.id)}
            onBackToParticipant={() => setShowCutReport(false)}
            onExcerpt={(quote, time) => {
              const sourceId = cutReport.excerpts.find((excerpt) => excerpt.quote === quote && excerpt.time === time)?.participant.split(" · ")[0];
              if (!sourceId || !props.participants.some((entry) => entry.id === sourceId)) return;
              setSelectedParticipantId(sourceId);
              setShowCutReport(false);
              handleTranscriptSelect(quote, timeToMinutes(time));
            }}
          />
        )}
      </section>
    </div>
  );
}

function TranscriptLine({ time, text, active, onClick }: { time: string; text: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`transcript-line ${active ? "active" : ""}`} onClick={onClick}>
      <span className="transcript-time">{time}</span>
      <span className="transcript-text">{text}</span>
    </button>
  );
}

function NewParticipantDialog({ onCreate, onClose }: {
  onCreate: (details: { name: string; city: string; age: number | null; cut: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [age, setAge] = useState("");
  const [cut, setCut] = useState(Object.keys(cutReports)[0]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="observation-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onCreate({ name: name.trim(), city: city.trim() || "Not specified", age: age ? Number(age) : null, cut });
      }}>
        <div className="modal-head">
          <div><div className="eyebrow">Study participants</div><h3>Add a participant.</h3></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <label><span>Name or pseudonym</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Participant 05" /></label>
        <label><span>City (optional)</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Mumbai" /></label>
        <label><span>Age (optional)</span><input type="number" min="1" max="120" value={age} onChange={(event) => setAge(event.target.value)} placeholder="e.g. 28" /></label>
        <label><span>Participant cut</span><select value={cut} onChange={(event) => setCut(event.target.value)}>{Object.keys(cutReports).map((label) => <option key={label}>{label}</option>)}</select></label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!name.trim()}>Add participant</button>
        </div>
      </form>
    </div>
  );
}

function TranscriptImport({ participantId, onImport }: { participantId: string; onImport: (contents: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onImport(await file.text());
    } catch {
      window.alert("This transcript file could not be read. Please try a plain text, SRT, VTT, or CSV file.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="transcript-import">
      <input ref={inputRef} type="file" accept=".txt,.srt,.vtt,.csv,text/plain,text/csv" onChange={handleFile} hidden />
      <button className="subtle-button" onClick={() => inputRef.current?.click()}><Plus size={14} /> Import transcript</button>
      <span>For {participantId} · TXT, SRT, VTT, or CSV</span>
    </div>
  );
}

function CutReportPanel({ cutReport, availableParticipantIds, onBackToParticipant, onExcerpt }: { cutReport: CutReport; availableParticipantIds: string[]; onBackToParticipant: () => void; onExcerpt: (q: string, t: string) => void }) {
  return (
    <div className="cut-report">
      <div className="report-head">
        <button className="back-button" onClick={onBackToParticipant}><ArrowLeft size={16} /> Participant view</button>
        <div>
          <div className="eyebrow">Cumulative cut view</div>
          <h2>{cutReport.title}</h2>
          <p>Example synthesis for demonstration · replace with your study data</p>
        </div>
        <span className="ai-badge"><Sparkles size={14} /> Illustrative sample</span>
      </div>

      <div className="report-grid">
        <ReportSection title="Recurring topics">
          <div className="topic-chips">
            {cutReport.recurring.map((t) => <span key={t}>{t}</span>)}
          </div>
        </ReportSection>

        <ReportSection title="Participant differences">
          <p className="report-copy">{cutReport.differences}</p>
        </ReportSection>

        <ReportSection title="Key excerpts" wide>
          <div className="excerpt-list">
            {cutReport.excerpts.map((e) => (
              <button className="excerpt-item" key={`${e.participant}-${e.time}`} disabled={!availableParticipantIds.includes(e.participant.split(" · ")[0])} onClick={() => onExcerpt(e.quote, e.time)} title={availableParticipantIds.includes(e.participant.split(" · ")[0]) ? "Open this participant's evidence" : "Illustrative excerpt; this participant is not included in the sample workspace"}>
                <div>
                  <span className="excerpt-participant">{e.participant}</span>
                  <span className="excerpt-time">{e.time}</span>
                </div>
                <p>“{e.quote}”</p>
                <span className="view-source">{availableParticipantIds.includes(e.participant.split(" · ")[0]) ? "View source" : "Sample excerpt · source unavailable"} <ArrowRight size={13} /></span>
              </button>
            ))}
          </div>
        </ReportSection>

        <ReportSection title="Contradictions / outliers">
          <p className="report-copy">{cutReport.contradictions}</p>
        </ReportSection>

        <ReportSection title="Areas to explore">
          <div className="explore-box"><WandSparkles size={15} /><p>{cutReport.explore}</p></div>
        </ReportSection>
      </div>
    </div>
  );
}

function ReportSection({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`report-section ${wide ? "wide" : ""}`}><div className="eyebrow">{title}</div>{children}</section>;
}

function InferencePhase(props: {
  participants: Participant[];
  observations: Observation[];
  clusters: Cluster[];
  connections: Relationship[];
  setConnections: Dispatch<SetStateAction<Relationship[]>>;
  selectedObsIds: string[];
  toggleObs: (id: string) => void;
  createClusterFromSelection: () => void;
  selectedClusterId: string | null;
  setSelectedClusterId: (id: string) => void;
  addToplineBlock: (id: string) => void;
  setClusters: Dispatch<SetStateAction<Cluster[]>>;
  setObservations: Dispatch<SetStateAction<Observation[]>>;
  selectedCut: string;
  setSelectedCut: (s: string) => void;
}) {
  const {
    participants,
    observations,
    clusters,
    connections,
    setConnections,
    selectedObsIds,
    toggleObs,
    createClusterFromSelection,
    selectedClusterId,
    setSelectedClusterId,
    addToplineBlock,
    setClusters,
    setObservations,
    selectedCut,
    setSelectedCut,
  } = props;

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showCuts, setShowCuts] = useState(true);
  const [dragState, setDragState] = useState<{
    kind: "obs" | "cluster";
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(null);
  const [lassoMode, setLassoMode] = useState(false);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState<{ kind: "obs" | "cluster"; id: string } | null>(null);

  const [editingRelationship, setEditingRelationship] = useState<string | null>(null);

  const getCanvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const beginDrag = (kind: "obs" | "cluster", id: string, e: React.PointerEvent) => {
    if (lassoMode || connectionMode) return;
    const { x, y } = getCanvasPoint(e);
    const item = kind === "obs"
      ? observations.find((o) => o.id === id)
      : clusters.find((c) => c.id === id);

    if (!item) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      kind,
      id,
      offsetX: x - item.x,
      offsetY: y - item.y,
    });
    e.stopPropagation();
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!dragState) return;
    const { x: canvasX, y: canvasY } = getCanvasPoint(e);
    const x = Math.max(10, canvasX - dragState.offsetX);
    const y = Math.max(10, canvasY - dragState.offsetY);

    if (dragState.kind === "obs") {
      setObservations((prev) =>
        prev.map((o) => o.id === dragState.id ? { ...o, x, y } : o)
      );
    } else {
      setClusters((prev) =>
        prev.map((c) => c.id === dragState.id ? { ...c, x, y } : c)
      );
    }
  };

  const endDrag = () => setDragState(null);

  const startLasso = (e: React.PointerEvent) => {
    if (!lassoMode || connectionMode) return;
    const p = getCanvasPoint(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
    setLassoStart(p);
    setLassoEnd(p);
  };

  const moveLasso = (e: React.PointerEvent) => {
    if (!lassoStart) return;
    setLassoEnd(getCanvasPoint(e));
  };

  const endLasso = () => {
    if (!lassoStart || !lassoEnd) return;

    const left = Math.min(lassoStart.x, lassoEnd.x);
    const right = Math.max(lassoStart.x, lassoEnd.x);
    const top = Math.min(lassoStart.y, lassoEnd.y);
    const bottom = Math.max(lassoStart.y, lassoEnd.y);

    const hitIds = observations
      .filter((o) => {
        const cx = o.x + 100;
        const cy = o.y + 55;
        return cx >= left && cx <= right && cy >= top && cy <= bottom;
      })
      .map((o) => o.id);

    if (hitIds.length) {
      hitIds.forEach((id) => {
        if (!selectedObsIds.includes(id)) toggleObs(id);
      });
    }

    setLassoStart(null);
    setLassoEnd(null);
    setLassoMode(false);
  };

  const clickConnectionTarget = (kind: "obs" | "cluster", id: string, e: React.MouseEvent | React.PointerEvent) => {
    if (!connectionMode) return;
    e.stopPropagation();

    if (!connectionStart) {
      setConnectionStart({ kind, id });
      return;
    }

    if (connectionStart.id === id && connectionStart.kind === kind) {
      setConnectionStart(null);
      return;
    }

    const rel = {
      id: `r${Date.now()}`,
      from: connectionStart,
      to: { kind, id },
      note: "Add a relationship note.",
    };

    setConnections((prev) => [...prev, rel]);
    setEditingRelationship(rel.id);
    setConnectionStart(null);
    setConnectionMode(false);
  };

  const updateRelationship = (id: string, note: string) => {
    setConnections((prev) => prev.map((r) => r.id === id ? { ...r, note } : r));
  };

  const itemCenter = (kind: "obs" | "cluster", id: string) => {
    if (kind === "obs") {
      const o = observations.find((x) => x.id === id);
      return o ? { x: o.x + 105, y: o.y + 55 } : { x: 0, y: 0 };
    }
    const c = clusters.find((x) => x.id === id);
    return c ? { x: c.x + 124, y: c.y + 80 } : { x: 0, y: 0 };
  };

  const rectangleFromLasso = lassoStart && lassoEnd ? {
    left: Math.min(lassoStart.x, lassoEnd.x),
    top: Math.min(lassoStart.y, lassoEnd.y),
    width: Math.abs(lassoEnd.x - lassoStart.x),
    height: Math.abs(lassoEnd.y - lassoStart.y),
  } : null;

  return (
    <div className="phase-body inference-layout">
      <div className="inference-toolbar">
        <div>
          <div className="eyebrow">Inference</div>
          <h2>Make meaning from what you noticed.</h2>
        </div>
        <div className="toolbar-actions">
          <button className={`toolbar-button ${showCuts ? "active" : ""}`} onClick={() => setShowCuts(!showCuts)}>
            <FolderOpen size={15} /> Cuts
          </button>
          <button className={`toolbar-button ${lassoMode ? "active" : ""}`} onClick={() => { setConnectionMode(false); setLassoMode(!lassoMode); }}>
            <span className="lasso-icon">⌁</span> Lasso
          </button>
          <button className={`toolbar-button ${connectionMode ? "active" : ""}`} onClick={() => { setLassoMode(false); setConnectionMode(!connectionMode); setConnectionStart(null); }}>
            <Link2 size={15} /> Connect
          </button>
          <button className="toolbar-button" onClick={createClusterFromSelection} disabled={!selectedObsIds.length}>
            <StickyNote size={15} /> Create cluster {selectedObsIds.length ? `(${selectedObsIds.length})` : ""}
          </button>
        </div>
      </div>

      <div className="inference-shell">
        <div
          ref={canvasRef}
          className={`canvas ${lassoMode ? "lasso-active" : ""} ${connectionMode ? "connection-active" : ""}`}
          onPointerDown={startLasso}
          onPointerMove={(e) => {
            moveDrag(e);
            moveLasso(e);
          }}
          onPointerUp={() => {
            endDrag();
            endLasso();
          }}
          onPointerCancel={() => { endDrag(); endLasso(); }}
        >
          <div className="canvas-grid" />

          {showCuts && (
            <>
              <div className="cut-zone zone-one"><span>Loyalists</span><small>{participants.filter((participant) => participant.cut === "Loyalists").length} participants</small></div>
              <div className="cut-zone zone-two"><span>Flirters</span><small>{participants.filter((participant) => participant.cut === "Flirters").length} participants</small></div>
              <div className="cut-zone zone-three"><span>Competitor Users</span><small>{participants.filter((participant) => participant.cut === "Competitor Users").length} participants</small></div>
              <div className="cut-zone zone-four"><span>Non-users</span><small>{participants.filter((participant) => participant.cut === "Non-users").length} participants</small></div>
            </>
          )}

          <svg className="relationship-layer">
            {connections.map((rel) => {
              const from = itemCenter(rel.from.kind, rel.from.id);
              const to = itemCenter(rel.to.kind, rel.to.id);
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              return (
                <g key={rel.id}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                  <foreignObject x={midX - 65} y={midY - 16} width="130" height="34">
                    <div className="relationship-note" onClick={() => setEditingRelationship(rel.id)}>
                      {editingRelationship === rel.id ? (
                        <input
                          autoFocus
                          value={rel.note}
                          onChange={(e) => updateRelationship(rel.id, e.target.value)}
                          onBlur={() => setEditingRelationship(null)}
                          onKeyDown={(e) => { if (e.key === "Enter") setEditingRelationship(null); }}
                        />
                      ) : (
                        <span>{rel.note}</span>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>

          {observations.map((o) => (
            <div
              key={o.id}
              className={`canvas-observation ${selectedObsIds.includes(o.id) ? "selected" : ""}`}
              style={{ left: o.x, top: o.y }}
              onClick={(e) => {
                e.stopPropagation();
                if (connectionMode) {
                  clickConnectionTarget("obs", o.id, e);
                } else if (!lassoMode) {
                  toggleObs(o.id);
                }
              }}
              onPointerDown={(e) => beginDrag("obs", o.id, e)}
            >
              <div className="canvas-card-handle">
                <GripVertical size={14} />
                <span>{o.time}</span>
              </div>
              <div className="tag-row"><span className="tag"><Tag size={10} /> {o.code}</span></div>
              <p>{o.note}</p>
              <div className="canvas-foot">{o.participantId} · {o.quote ? "transcript linked" : "no quote attached"}</div>
            </div>
          ))}

          {clusters.map((c) => (
            <div
              key={c.id}
              className={`canvas-cluster ${selectedClusterId === c.id ? "selected" : ""}`}
              style={{ left: c.x, top: c.y }}
              onClick={(e) => {
                e.stopPropagation();
                if (connectionMode) {
                  clickConnectionTarget("cluster", c.id, e);
                } else if (!lassoMode) {
                  setSelectedClusterId(c.id);
                }
              }}
              onPointerDown={(e) => beginDrag("cluster", c.id, e)}
            >
              <div className="cluster-head">
                <span>Cluster</span>
                <button className="mini-menu" onClick={(e) => e.stopPropagation()}><MoreHorizontal size={14} /></button>
              </div>
              <input
                value={c.title}
                onChange={(e) => setClusters((prev) => prev.map((x) => x.id === c.id ? { ...x, title: e.target.value } : x))}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <textarea
                value={c.thought}
                onChange={(e) => setClusters((prev) => prev.map((x) => x.id === c.id ? { ...x, thought: e.target.value } : x))}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <div className="cluster-foot">
                <span>{c.observationIds.length} observations</span>
                <button onClick={(e) => { e.stopPropagation(); addToplineBlock(c.id); }}>
                  <ArrowRight size={13} /> Topline
                </button>
              </div>
            </div>
          ))}

          {rectangleFromLasso && (
            <div
              className="lasso-rectangle"
              style={{
                left: rectangleFromLasso.left,
                top: rectangleFromLasso.top,
                width: rectangleFromLasso.width,
                height: rectangleFromLasso.height,
              }}
            />
          )}

          <div className="canvas-hint">
            <span>{connectionMode ? "Connect" : lassoMode ? "Lasso" : "Tip"}</span>
            {connectionMode
              ? connectionStart ? "Click another block to connect." : "Click a block, then another block."
              : lassoMode
                ? "Draw around observations to select them."
                : "Drag blocks freely. Select observations, then create a cluster."}
          </div>
        </div>

        <aside className="inference-side">
          <div className="side-card">
            <div className="eyebrow">Current lens</div>
            <h3>{selectedCut === "All" ? "Open canvas" : selectedCut}</h3>
            <p>Use study cuts as context, but keep the space open for your own structure.</p>
            <div className="lens-list">
              {Object.keys(cutReports).map((cut) => (
                <button key={cut} onClick={() => setSelectedCut(cut)} className={selectedCut === cut ? "active" : ""}>
                  {cut}<span>{participants.filter((participant) => participant.cut === cut).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="side-card">
            <div className="eyebrow">Selected</div>
            {selectedObsIds.length ? (
              <>
                <h3>{selectedObsIds.length} observations</h3>
                <p>Ready to become a cluster.</p>
                <button className="primary-button small" onClick={createClusterFromSelection}>Create cluster</button>
              </>
            ) : selectedCluster ? (
              <>
                <h3>{selectedCluster.title}</h3>
                <p>{selectedCluster.thought}</p>
                <button className="secondary-button small" onClick={() => addToplineBlock(selectedCluster.id)}>Move to Topline</button>
              </>
            ) : (
              <p>Select observations or a cluster to inspect it here.</p>
            )}
          </div>

          {connectionStart && (
            <div className="side-card connection-instruction">
              <div className="eyebrow">New relationship</div>
              <p>Choose another observation or cluster to create a relationship.</p>
              <button className="secondary-button small" onClick={() => { setConnectionStart(null); setConnectionMode(false); }}>Cancel</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ToplinePhase(props: {
  clusters: Cluster[];
  setClusters: Dispatch<SetStateAction<Cluster[]>>;
  toplineBlocks: string[];
  setToplineBlocks: Dispatch<SetStateAction<string[]>>;
  newToplineText: string;
  setNewToplineText: (s: string) => void;
  toplineTitle: string;
  setToplineTitle: (s: string) => void;
  toplineBody: string;
  setToplineBody: (s: string) => void;
  removeToplineBlock: (id: string) => void;
}) {
  const { clusters, setClusters, toplineBlocks, setToplineBlocks, newToplineText, setNewToplineText, toplineTitle, setToplineTitle, toplineBody, setToplineBody, removeToplineBlock } = props;
  const [draggedClusterId, setDraggedClusterId] = useState<string | null>(null);

  const insertCluster = (id: string) => {
    setToplineBlocks((prev) => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/cluster");
    if (id) insertCluster(id);
    setDraggedClusterId(null);
  };

  return (
    <div className="phase-body topline-layout">
      <div className="topline-wrap">
        <div className="topline-header">
          <div>
            <div className="eyebrow">Topline</div>
            <h2>Write the story in your own words.</h2>
          </div>
          <div className="writing-status"><span className="save-dot" /> Draft saved locally</div>
        </div>

        <div
          className="topline-editor"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input className="topline-title" value={toplineTitle} onChange={(event) => setToplineTitle(event.target.value)} aria-label="Topline title" />
          <textarea
            className="topline-intro"
            value={newToplineText}
            onChange={(e) => setNewToplineText(e.target.value)}
          />

          {toplineBlocks.map((id) => {
            const c = clusters.find((x) => x.id === id);
            if (!c) return null;
            return (
              <div className="research-block" key={id}>
                <div className="research-block-label">
                  <span>Research thought · click to refine</span>
                  <button onClick={() => removeToplineBlock(id)} title="Remove from writing">
                    <X size={14} />
                  </button>
                </div>
                <h3>{c.title}</h3>
                <textarea value={c.thought} onChange={(event) => setClusters((previous) => previous.map((cluster) => cluster.id === c.id ? { ...cluster, thought: event.target.value } : cluster))} />
                <div className="research-block-source">
                  <Link2 size={13} /> Linked to Inference cluster · {c.observationIds.length} observations
                </div>
              </div>
            );
          })}

          <textarea
            className="prose-area"
            placeholder="Continue writing here…"
            value={toplineBody}
            onChange={(event) => setToplineBody(event.target.value)}
          />

          <div className={`topline-drop-zone ${draggedClusterId ? "ready" : ""}`}>
            <ArrowDownIcon />
            <span>{draggedClusterId ? "Release to add this research thought" : "Drag a research thought here from the right"}</span>
          </div>

          <div className="topline-actions">
            <button onClick={() => setToplineBody(`${toplineBody}\n\n## New section\n\nWrite your findings here…`)}><Plus size={15} /> Add section</button>
            <button onClick={() => downloadTextFile("sweetleaf-topline.md", `# ${toplineTitle}\n\n${newToplineText}\n\n${toplineBlocks.map((id) => {
              const cluster = clusters.find((item) => item.id === id);
              return cluster ? `## ${cluster.title}\n\n${cluster.thought}` : "";
            }).filter(Boolean).join("\n\n")}\n\n${toplineBody}`, "text/markdown")}><FileText size={15} /> Export draft</button>
          </div>
        </div>
      </div>

      <aside className="topline-side">
        <div className="writer-side-card">
          <div className="eyebrow">Research blocks</div>
          <h3>Drag thinking into the story.</h3>
          <p>These are the synthesized thoughts you created in Inference.</p>
          <div className="block-list">
            {clusters.map((c) => (
              <button
                key={c.id}
                className={`drag-block ${toplineBlocks.includes(c.id) ? "used" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/cluster", c.id);
                  setDraggedClusterId(c.id);
                }}
                onDragEnd={() => setDraggedClusterId(null)}
                onClick={() => insertCluster(c.id)}
              >
                <GripVertical size={15} />
                <div>
                  <strong>{c.title}</strong>
                  <span>{c.thought}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ArrowDownIcon() {
  return <span className="drop-arrow"><ArrowRight size={15} /></span>;
}

export default App;
