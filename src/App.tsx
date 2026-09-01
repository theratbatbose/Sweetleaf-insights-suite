import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CirclePlay,
  FileText,
  FolderOpen,
  GripVertical,
  Link2,
  Menu,
  MoreHorizontal,
  Pause,
  Plus,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Tag,
  UserRound,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type Phase = "Observation" | "Inference" | "Topline";

type Participant = {
  id: string;
  name: string;
  city: string;
  age: number;
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

const participants: Participant[] = [
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
  const [phase, setPhase] = useState<Phase>("Observation");
  const [selectedParticipantId, setSelectedParticipantId] = useState("P17");
  const [selectedCut, setSelectedCut] = useState("Loyalists");
  const [showCutReport, setShowCutReport] = useState(true);
  const [showObservationComposer, setShowObservationComposer] = useState(false);
  const [selectedTranscript, setSelectedTranscript] = useState("");
  const [observationNote, setObservationNote] = useState("");
  const [observationCode, setObservationCode] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(16);
  const [observations, setObservations] = useState<Observation[]>(initialObservations);
  const [clusters, setClusters] = useState<Cluster[]>(initialClusters);
  const [selectedObsIds, setSelectedObsIds] = useState<string[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>("c1");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toplineBlocks, setToplineBlocks] = useState<string[]>(["c1"]);


  const [newToplineText, setNewToplineText] = useState(
    "The category is not discovered in isolation. Familiarity, social proof and the lived experience of other people make unfamiliar choices feel safer—and more credible."
  );

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId)!;
  const cutReport = cutReports[selectedCut];

  const currentObservations = observations.filter((o) => o.participantId === selectedParticipant.id);
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;

  const allSearchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return [
      ...participants.filter((p) => `${p.name} ${p.cut} ${p.profile}`.toLowerCase().includes(q)).map((p) => `Participant · ${p.name}`),
      ...observations.filter((o) => `${o.code} ${o.note} ${o.quote}`.toLowerCase().includes(q)).map((o) => `Observation · ${o.code}`),
      ...clusters.filter((c) => `${c.title} ${c.thought}`.toLowerCase().includes(q)).map((c) => `Cluster · ${c.title}`),
    ];
  }, [search, observations, clusters]);

  const handleTranscriptSelect = (quote: string, time: number) => {
    setSelectedTranscript(quote);
    setCurrentTime(time);
    setShowObservationComposer(true);
  };

  const saveObservation = () => {
    if (!observationNote.trim()) return;
    const newObs: Observation = {
      id: `o${Date.now()}`,
      participantId: selectedParticipant.id,
      code: observationCode.trim() || "Unlabelled",
      note: observationNote.trim(),
      quote: selectedTranscript || "Selected transcript excerpt",
      time: `${Math.floor(currentTime).toString().padStart(2, "0")}:24`,
      duration: 18,
      x: 130 + (observations.length % 3) * 180,
      y: 110 + (observations.length % 4) * 105,
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
    const cluster: Cluster = {
      id: `c${Date.now()}`,
      title: "New cluster",
      thought: "Add the researcher's synthesized thought here.",
      observationIds: ids,
      x: 760,
      y: 150 + clusters.length * 60,
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
          <button className="icon-btn" title="Settings"><Settings2 size={18} /></button>
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
              {allSearchResults.length ? allSearchResults.map((item) => <div className="search-result" key={item}>{item}</div>) : <div className="search-empty">No matches.</div>}
            </div>
          )}
        </div>
      )}

      <main className="main-stage">
        <div className="study-banner">
          <div>
            <div className="eyebrow">Study</div>
            <h1>New Beverage Category</h1>
            <p>Understand how consumers discover, evaluate and adopt emerging beverage brands.</p>
          </div>
          <div className="study-meta">
            <span>24 participants</span>
            <span>4 cuts</span>
            <span>Fieldwork · June 2026</span>
            <span className="local-pill">Local project</span>
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
            participant={selectedParticipant}
            selectedParticipantId={selectedParticipantId}
            setSelectedParticipantId={setSelectedParticipantId}
            selectedCut={selectedCut}
            setSelectedCut={setSelectedCut}
            currentObservations={currentObservations}
            cutReport={cutReport}
            showCutReport={showCutReport}
            setShowCutReport={setShowCutReport}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            playing={playing}
            setPlaying={setPlaying}
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
            observations={observations}
            clusters={clusters}
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
            removeToplineBlock={(id) => setToplineBlocks((ids) => ids.filter((x) => x !== id))}
          />
        )}
      </main>
    </div>
  );
}

function ObservationPhase(props: {
  participants: Participant[];
  participant: Participant;
  selectedParticipantId: string;
  setSelectedParticipantId: (id: string) => void;
  selectedCut: string;
  setSelectedCut: (cut: string) => void;
  currentObservations: Observation[];
  cutReport: CutReport;
  showCutReport: boolean;
  setShowCutReport: (v: boolean) => void;
  currentTime: number;
  setCurrentTime: (v: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
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
    cutReport,
    showCutReport,
    setShowCutReport,
    currentTime,
    setCurrentTime,
    playing,
    setPlaying,
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

  return (
    <div className="phase-body observation-layout">
      <aside className="left-panel">
        <div className="panel-section">
          <div className="panel-label">Study</div>
          <button className={`nav-item ${selectedCut === "All" ? "selected" : ""}`} onClick={() => setSelectedCut("All")}>
            <FolderOpen size={16} /> All participants
          </button>
        </div>

        <div className="panel-section">
          <div className="panel-label">Cuts</div>
          {Object.keys(cutReports).map((cut) => (
            <button key={cut} className={`nav-item ${selectedCut === cut ? "selected" : ""}`} onClick={() => { setSelectedCut(cut); setShowCutReport(true); }}>
              <span className="cut-dot" />
              <span>{cut}</span>
              <span className="nav-count">{cutReports[cut].count}</span>
            </button>
          ))}
        </div>

        <div className="panel-section">
          <div className="panel-label">Participants</div>
          {props.participants.map((p) => (
            <button key={p.id} className={`participant-item ${selectedParticipantId === p.id ? "selected" : ""}`} onClick={() => { setSelectedParticipantId(p.id); setShowCutReport(false); }}>
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
                  <span>{participant.age}</span>
                  <span>{participant.city}</span>
                  <span>{participant.cut}</span>
                  <span>{participant.profile}</span>
                </div>
              </div>
              <div className="session-meta"><span>{participant.session}</span><span className="live-dot" /> Local recording</div>
            </div>

            <div className="evidence-grid">
              <div className="video-card">
                <div className="video-header">
                  <span>Interview recording</span>
                  <span>44:12</span>
                </div>
                <div className="video-surface">
                  <div className="video-grid" />
                  <div className="video-center">
                    <button className="big-play" onClick={() => setPlaying(!playing)}>
                      {playing ? <Pause size={24} /> : <CirclePlay size={29} />}
                    </button>
                    <span>{playing ? "Playing interview" : "Resume interview"}</span>
                  </div>
                  <div className="video-overlay-title">{participant.name} · Field interview</div>
                </div>
                <div className="timeline-wrap">
                  <div className="timeline-ruler">
                    <span>00:00</span><span>10:00</span><span>20:00</span><span>30:00</span><span>40:00</span>
                  </div>
                  <input className="timeline-slider" type="range" min="0" max="44" value={currentTime} onChange={(e) => setCurrentTime(Number(e.target.value))} />
                  <div className="timeline-dots">
                    {currentObservations.map((o) => {
                      const left = Math.min(97, Math.max(2, (parseInt(o.time.split(":")[0], 10) / 44) * 100));
                      return <button key={o.id} className="timeline-dot" style={{ left: `${left}%` }} title={o.code} onClick={() => setCurrentTime(parseInt(o.time.split(":")[0], 10))} />;
                    })}
                    <span className="playhead" style={{ left: `${(currentTime / 44) * 100}%` }} />
                  </div>
                  <div className="video-controls">
                    <div>
                      <button className="small-control" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} /> : <CirclePlay size={15} />}</button>
                      <span>{String(Math.floor(currentTime)).padStart(2, "0")}:24 / 44:12</span>
                    </div>
                    <span className="control-caption">{currentObservations.length} observations</span>
                  </div>
                </div>
              </div>

              <div className="transcript-card">
                <div className="card-title-row">
                  <div>
                    <span className="eyebrow">Transcript</span>
                    <h3>Interview transcript</h3>
                  </div>
                  <button className="subtle-button"><FileText size={15} /> Export</button>
                </div>
                <div className="transcript-scroll">
                  <TranscriptLine time="14:03" text="I usually discover things through people first. If somebody I know is already using it, it gives me a reason to pay attention." active={currentTime >= 13 && currentTime < 16} onClick={() => handleTranscriptSelect("I usually discover things through people first. If somebody I know is already using it, it gives me a reason to pay attention.", 14)} />
                  <TranscriptLine time="14:21" text="I'd rather see someone I actually know using it. Otherwise it feels a bit like a brand trying to convince me." active={currentTime >= 16 && currentTime < 20} onClick={() => handleTranscriptSelect("I'd rather see someone I actually know using it. Otherwise it feels a bit like a brand trying to convince me.", 17)} />
                  <TranscriptLine time="22:08" text="I don't want to waste money on something I don't know I'll like. I think the social proof makes that feel safer." active={currentTime >= 22 && currentTime < 25} onClick={() => handleTranscriptSelect("I don't want to waste money on something I don't know I'll like. I think the social proof makes that feel safer.", 23)} />
                  <TranscriptLine time="30:19" text="When someone tells me they used it and liked it, I don't need the brand to work that hard." active={currentTime >= 30 && currentTime < 33} onClick={() => handleTranscriptSelect("When someone tells me they used it and liked it, I don't need the brand to work that hard.", 31)} />
                  <TranscriptLine time="35:41" text="I don't think that means I'm never interested in something new. It just means I want somebody else to go first." active={currentTime >= 35 && currentTime < 39} onClick={() => handleTranscriptSelect("I don't think that means I'm never interested in something new. It just means I want somebody else to go first.", 36)} />
                </div>
              </div>
            </div>

            <div className="observations-strip">
              <div className="strip-title">
                <div>
                  <span className="eyebrow">Your observations</span>
                  <h3>{currentObservations.length} captured moments</h3>
                </div>
                <button className="subtle-button" onClick={() => setShowComposer(true)}><Plus size={15} /> New observation</button>
              </div>
              <div className="observation-mini-grid">
                {currentObservations.map((o) => (
                  <div key={o.id} className="observation-mini">
                    <div className="observation-mini-top"><span className="tag"><Tag size={11} /> {o.code}</span><span>{o.time}</span></div>
                    <p>{o.note}</p>
                    <div className="observation-source"><Video size={13} /> Source linked</div>
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
                    <div className="evidence-label"><StickyNote size={14} /> Selected evidence · {currentTime.toString().padStart(2, "0")}:24</div>
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
                    <button className="primary-button" onClick={saveObservation}>Log observation</button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <CutReportPanel
            cutReport={cutReport}
            onBackToParticipant={() => setShowCutReport(false)}
            onExcerpt={(quote, time) => handleTranscriptSelect(quote, parseInt(time.split(":")[0], 10))}
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

function CutReportPanel({ cutReport, onBackToParticipant, onExcerpt }: { cutReport: CutReport; onBackToParticipant: () => void; onExcerpt: (q: string, t: string) => void }) {
  return (
    <div className="cut-report">
      <div className="report-head">
        <button className="back-button" onClick={onBackToParticipant}><ArrowLeft size={16} /> Participant view</button>
        <div>
          <div className="eyebrow">Cumulative cut view</div>
          <h2>{cutReport.title}</h2>
          <p>{cutReport.count} participants · AI-assisted synthesis from local transcripts</p>
        </div>
        <span className="ai-badge"><Sparkles size={14} /> Research assist</span>
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
              <button className="excerpt-item" key={`${e.participant}-${e.time}`} onClick={() => onExcerpt(e.quote, e.time)}>
                <div>
                  <span className="excerpt-participant">{e.participant}</span>
                  <span className="excerpt-time">{e.time}</span>
                </div>
                <p>“{e.quote}”</p>
                <span className="view-source">View source <ArrowRight size={13} /></span>
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
  observations: Observation[];
  clusters: Cluster[];
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
    observations,
    clusters,
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
  const [connections, setConnections] = useState<Array<{
    id: string;
    from: { kind: "obs" | "cluster"; id: string };
    to: { kind: "obs" | "cluster"; id: string };
    note: string;
  }>>([
    { id: "r1", from: { kind: "cluster", id: "c1" }, to: { kind: "cluster", id: "c2" }, note: "reduces perceived risk" },
  ]);

  const [editingRelationship, setEditingRelationship] = useState<string | null>(null);

  const getCanvasPoint = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const beginDrag = (kind: "obs" | "cluster", id: string, e: React.MouseEvent) => {
    if (lassoMode || connectionMode) return;
    const { x, y } = getCanvasPoint(e);
    const item = kind === "obs"
      ? observations.find((o) => o.id === id)
      : clusters.find((c) => c.id === id);

    if (!item) return;

    setDragState({
      kind,
      id,
      offsetX: x - item.x,
      offsetY: y - item.y,
    });
    e.preventDefault();
    e.stopPropagation();
  };

  const moveDrag = (e: React.MouseEvent) => {
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

  const startLasso = (e: React.MouseEvent) => {
    if (!lassoMode || connectionMode) return;
    const p = getCanvasPoint(e);
    setLassoStart(p);
    setLassoEnd(p);
  };

  const moveLasso = (e: React.MouseEvent) => {
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

  const clickConnectionTarget = (kind: "obs" | "cluster", id: string, e: React.MouseEvent) => {
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
          onMouseDown={startLasso}
          onMouseMove={(e) => {
            moveDrag(e);
            moveLasso(e);
          }}
          onMouseUp={() => {
            endDrag();
            endLasso();
          }}
        >
          <div className="canvas-grid" />

          {showCuts && (
            <>
              <div className="cut-zone zone-one"><span>Loyalists</span><small>8 participants</small></div>
              <div className="cut-zone zone-two"><span>Flirters</span><small>6 participants</small></div>
              <div className="cut-zone zone-three"><span>Competitor Users</span><small>5 participants</small></div>
              <div className="cut-zone zone-four"><span>Non-users</span><small>5 participants</small></div>
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
              onMouseDown={(e) => beginDrag("obs", o.id, e)}
            >
              <div className="canvas-card-handle">
                <GripVertical size={14} />
                <span>{o.time}</span>
              </div>
              <div className="tag-row"><span className="tag"><Tag size={10} /> {o.code}</span></div>
              <p>{o.note}</p>
              <div className="canvas-foot">{o.participantId} · source linked</div>
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
              onMouseDown={(e) => beginDrag("cluster", c.id, e)}
            >
              <div className="cluster-head">
                <span>Cluster</span>
                <button className="mini-menu" onClick={(e) => e.stopPropagation()}><MoreHorizontal size={14} /></button>
              </div>
              <input
                value={c.title}
                onChange={(e) => setClusters((prev) => prev.map((x) => x.id === c.id ? { ...x, title: e.target.value } : x))}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <textarea
                value={c.thought}
                onChange={(e) => setClusters((prev) => prev.map((x) => x.id === c.id ? { ...x, thought: e.target.value } : x))}
                onMouseDown={(e) => e.stopPropagation()}
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
                  {cut}<span>{cutReports[cut].count}</span>
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
  toplineBlocks: string[];
  setToplineBlocks: Dispatch<SetStateAction<string[]>>;
  newToplineText: string;
  setNewToplineText: (s: string) => void;
  removeToplineBlock: (id: string) => void;
}) {
  const { clusters, toplineBlocks, setToplineBlocks, newToplineText, setNewToplineText, removeToplineBlock } = props;
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
          <input className="topline-title" defaultValue="The role of social proof in trial" />
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
                <textarea defaultValue={c.thought} />
                <div className="research-block-source">
                  <Link2 size={13} /> Linked to Inference cluster · {c.observationIds.length} observations
                </div>
              </div>
            );
          })}

          <textarea
            className="prose-area"
            placeholder="Continue writing here…"
            defaultValue={`The role of social proof is especially clear in the moments where participants are weighing risk against novelty.

What matters is not simply that people hear from others. It is that another person's lived experience makes an unfamiliar choice feel less uncertain.

The implication is that...`}
          />

          <div className={`topline-drop-zone ${draggedClusterId ? "ready" : ""}`}>
            <ArrowDownIcon />
            <span>{draggedClusterId ? "Release to add this research thought" : "Drag a research thought here from the right"}</span>
          </div>

          <div className="topline-actions">
            <button><Plus size={15} /> Add section</button>
            <button><FileText size={15} /> Export draft</button>
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
