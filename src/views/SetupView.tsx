import { ArrowDown, ArrowUp, FileText, Plus, Trash2, Upload, Wand2 } from "lucide-react";
import { useState } from "react";
import type { GuideSection, Participant, Segment, StudyDesign } from "../../shared/types";
import { allQuestions, makeId, newSegment, parseCsv, parseDiscussionGuide, SEGMENT_COLORS } from "../../shared/util";
import { api, readDocumentText } from "../api";
import type { ViewProps } from "../components/Workspace";
import { AiButton, Button, Field, Modal, pickFile, useAction, useApp } from "../ui";

const DOC_ACCEPT = ".docx,.txt,.md,.csv";

function DocumentSource({ label, text, onText, placeholder }: { label: string; text: string; onText: (text: string) => void; placeholder: string }) {
  const { notify } = useApp();
  const [open, setOpen] = useState(!text);
  const load = async () => {
    const [file] = await pickFile(DOC_ACCEPT);
    if (!file) return;
    try {
      const value = await readDocumentText(file);
      if (!value.trim()) throw new Error("No text was found in that file.");
      onText(value);
      setOpen(false);
      notify(`Loaded ${file.name}.`, "success");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };
  return (
    <div className="doc-source">
      <div className="doc-source-head">
        <span className="field-label">{label}</span>
        <div className="row-actions">
          <Button size="small" onClick={load} icon={<Upload size={14} />}>Upload Word / text</Button>
          {text && <Button size="small" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide text" : `Show text (${text.length.toLocaleString()} characters)`}</Button>}
        </div>
      </div>
      {open && <textarea className="doc-text" value={text} onChange={(event) => onText(event.target.value)} placeholder={placeholder} />}
    </div>
  );
}

export function SetupView({ study, update, goTo }: ViewProps) {
  const { notify } = useApp();
  const action = useAction();
  const [importingPeople, setImportingPeople] = useState<string[][] | null>(null);

  const setDesign = (patch: Partial<StudyDesign>) => update((current) => ({ ...current, design: { ...current.design, ...patch } }));
  const setSegments = (change: (segments: Segment[]) => Segment[]) => update((current) => ({ ...current, segments: change(current.segments) }));
  const setGuide = (change: (guide: GuideSection[]) => GuideSection[]) => update((current) => ({ ...current, guide: change(current.guide) }));
  const setParticipants = (change: (participants: Participant[]) => Participant[]) => update((current) => ({ ...current, participants: change(current.participants) }));

  const gridHasData = Object.values(study.grid).some((row) => Object.keys(row).length);
  const replaceGuide = (sections: GuideSection[]) => {
    if (!sections.length) return notify("No questions were found. Check the text, or add questions by hand below.", "error");
    if (study.guide.length && !window.confirm(gridHasData
      ? "Replace the current guide? Grid cells written against the old questions will no longer be shown."
      : "Replace the current guide with the newly structured one?")) return;
    setGuide(() => sections);
    notify(`Guide structured into ${sections.length} sections and ${allQuestions(sections).length} questions. Review and edit below.`, "success");
  };

  const questionCount = allQuestions(study.guide).length;

  return (
    <div className="setup">
      <aside className="setup-nav"><div className="setup-nav-inner">
        <button onClick={() => scrollToSection("setup-design")}>1. Brief & objectives</button>
        <button onClick={() => scrollToSection("setup-segments")}>2. Segments ({study.segments.length})</button>
        <button onClick={() => scrollToSection("setup-guide")}>3. Discussion guide ({questionCount})</button>
        <button onClick={() => scrollToSection("setup-people")}>4. Participants ({study.participants.length})</button>
        <div className="setup-next">
          <p>When the guide and participants are in, add recordings and transcripts.</p>
          <Button variant="primary" size="small" onClick={() => goTo("sessions")}>Go to Sessions →</Button>
        </div>
      </div></aside>

      <div className="setup-main">
        {/* ---------------- 1. Design ---------------- */}
        <section id="setup-design" className="card">
          <div className="card-head">
            <div><div className="eyebrow">Step 1</div><h2>Brief & objectives</h2><p>Paste or upload the client brief or proposal. The objectives guide every AI summary, so keep them crisp.</p></div>
          </div>
          <DocumentSource label="Brief / proposal (optional)" text={study.design.briefText} onText={(briefText) => setDesign({ briefText })} placeholder="Paste the research brief or proposal here…" />
          <div className="row-actions">
            <AiButton disabled={!study.design.briefText.trim()} onClick={action(async () => {
              const design = await api.extractDesign(study.design.briefText);
              setDesign(Object.fromEntries(Object.entries(design).filter(([key, value]) => value && !(study.design as Record<string, string>)[key]?.trim())));
            }, "Filled in the empty design fields from the brief.")}>Fill fields from brief</AiButton>
          </div>
          <div className="form-grid">
            <Field label="Client"><input value={study.design.client} onChange={(event) => setDesign({ client: event.target.value })} /></Field>
            <Field label="Methodology" hint="e.g. 24 IDIs × 60 min, 4 FGDs"><input value={study.design.methodology} onChange={(event) => setDesign({ methodology: event.target.value })} /></Field>
            <Field label="Markets / cities"><input value={study.design.markets} onChange={(event) => setDesign({ markets: event.target.value })} /></Field>
            <Field label="Interview languages"><input value={study.design.languages} onChange={(event) => setDesign({ languages: event.target.value })} placeholder="e.g. Hindi, Hinglish, Tamil" /></Field>
          </div>
          <Field label="Research objectives" hint="One per line."><textarea rows={5} value={study.design.objectives} onChange={(event) => setDesign({ objectives: event.target.value })} placeholder={"- Understand…\n- Identify…"} /></Field>
          <Field label="Background (optional)"><textarea rows={3} value={study.design.background} onChange={(event) => setDesign({ background: event.target.value })} /></Field>
        </section>

        {/* ---------------- 2. Segments ---------------- */}
        <section id="setup-segments" className="card">
          <div className="card-head">
            <div><div className="eyebrow">Step 2</div><h2>Segments (cuts)</h2><p>The respondent groups you will compare — e.g. Loyalists vs Lapsers, SEC A vs B, metro vs Tier 2. Upload the screener to detect them.</p></div>
          </div>
          <DocumentSource label="Screener (optional)" text={study.design.screenerText} onText={(screenerText) => setDesign({ screenerText })} placeholder="Paste the recruitment screener here…" />
          <div className="row-actions">
            <AiButton disabled={!study.design.screenerText.trim() && !study.design.briefText.trim()} onClick={action(async () => {
              const { segments } = await api.extractSegments(study.design.screenerText, study.design.briefText, study.segments.length);
              const existing = new Set(study.segments.map((segment) => segment.name.toLowerCase()));
              const fresh = segments.filter((segment) => !existing.has(segment.name.toLowerCase()));
              setSegments((list) => [...list, ...fresh]);
              notify(fresh.length ? `Added ${fresh.length} segments. Review them below.` : "No new segments were found.", "success");
            })}>Detect segments from screener</AiButton>
            <Button icon={<Plus size={15} />} onClick={() => setSegments((list) => [...list, newSegment(`Segment ${list.length + 1}`, list.length)])}>Add segment</Button>
          </div>
          <div className="segment-list">
            {study.segments.map((segment) => (
              <div key={segment.id} className="segment-row">
                <input type="color" value={segment.color} onChange={(event) => setSegments((list) => list.map((entry) => entry.id === segment.id ? { ...entry, color: event.target.value } : entry))} aria-label="Segment colour" />
                <input className="segment-name" value={segment.name} onChange={(event) => setSegments((list) => list.map((entry) => entry.id === segment.id ? { ...entry, name: event.target.value } : entry))} aria-label="Segment name" />
                <input value={segment.description} placeholder="Short description" onChange={(event) => setSegments((list) => list.map((entry) => entry.id === segment.id ? { ...entry, description: event.target.value } : entry))} />
                <input value={segment.criteria} placeholder="Recruitment criteria" onChange={(event) => setSegments((list) => list.map((entry) => entry.id === segment.id ? { ...entry, criteria: event.target.value } : entry))} />
                <input className="quota" type="number" min={0} value={segment.quota ?? ""} placeholder="Quota" onChange={(event) => setSegments((list) => list.map((entry) => entry.id === segment.id ? { ...entry, quota: event.target.value ? Number(event.target.value) : null } : entry))} />
                <span className="muted-text small">{study.participants.filter((participant) => participant.segmentId === segment.id).length} recruited</span>
                <button className="icon-btn danger" title="Remove segment" onClick={() => {
                  if (!window.confirm(`Remove segment “${segment.name}”? Participants in it become unassigned.`)) return;
                  update((current) => ({
                    ...current,
                    segments: current.segments.filter((entry) => entry.id !== segment.id),
                    participants: current.participants.map((participant) => participant.segmentId === segment.id ? { ...participant, segmentId: null } : participant),
                  }));
                }}><Trash2 size={15} /></button>
              </div>
            ))}
            {!study.segments.length && <p className="muted-text">No segments yet. You can work without them, but comparing cuts is where qualitative insight usually lives.</p>}
          </div>
        </section>

        {/* ---------------- 3. Guide ---------------- */}
        <section id="setup-guide" className="card">
          <div className="card-head">
            <div><div className="eyebrow">Step 3</div><h2>Discussion guide → analysis framework</h2><p>Each guide question becomes a row in the analysis grid. Upload the guide, structure it, then tidy the wording.</p></div>
          </div>
          <DocumentSource label="Discussion guide" text={study.design.guideText} onText={(guideText) => setDesign({ guideText })} placeholder="Paste the discussion guide here…" />
          <div className="row-actions">
            <AiButton variant="primary" disabled={!study.design.guideText.trim()} onClick={action(async () => replaceGuide((await api.structureGuide(study.design.guideText)).sections))}>Structure guide with AI</AiButton>
            <Button disabled={!study.design.guideText.trim()} icon={<Wand2 size={15} />} onClick={() => replaceGuide(parseDiscussionGuide(study.design.guideText))}>Structure automatically (no AI)</Button>
            <Button icon={<Plus size={15} />} onClick={() => setGuide((guide) => [...guide, { id: makeId("g"), title: `Section ${guide.length + 1}`, questions: [{ id: makeId("q"), text: "" }] }])}>Add section</Button>
          </div>
          <div className="guide-editor">
            {study.guide.map((section, sectionIndex) => (
              <div key={section.id} className="guide-section">
                <div className="guide-section-head">
                  <input value={section.title} onChange={(event) => setGuide((guide) => guide.map((entry) => entry.id === section.id ? { ...entry, title: event.target.value } : entry))} aria-label="Section title" />
                  <button className="icon-btn" title="Move up" disabled={sectionIndex === 0} onClick={() => setGuide((guide) => move(guide, sectionIndex, -1))}><ArrowUp size={15} /></button>
                  <button className="icon-btn" title="Move down" disabled={sectionIndex === study.guide.length - 1} onClick={() => setGuide((guide) => move(guide, sectionIndex, 1))}><ArrowDown size={15} /></button>
                  <button className="icon-btn danger" title="Delete section" onClick={() => window.confirm(`Delete section “${section.title}” and its questions?`) && setGuide((guide) => guide.filter((entry) => entry.id !== section.id))}><Trash2 size={15} /></button>
                </div>
                {section.questions.map((question, questionIndex) => (
                  <div key={question.id} className="guide-question">
                    <span className="q-no">{sectionIndex + 1}.{questionIndex + 1}</span>
                    <textarea rows={Math.max(1, Math.ceil(question.text.length / 95))} value={question.text} placeholder="Question" onChange={(event) => setGuide((guide) => guide.map((entry) => entry.id === section.id ? { ...entry, questions: entry.questions.map((q) => q.id === question.id ? { ...q, text: event.target.value } : q) } : entry))} />
                    <button className="icon-btn" title="Move up" disabled={questionIndex === 0} onClick={() => setGuide((guide) => guide.map((entry) => entry.id === section.id ? { ...entry, questions: move(entry.questions, questionIndex, -1) } : entry))}><ArrowUp size={14} /></button>
                    <button className="icon-btn danger" title="Delete question" onClick={() => setGuide((guide) => guide.map((entry) => entry.id === section.id ? { ...entry, questions: entry.questions.filter((q) => q.id !== question.id) } : entry))}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button className="btn ghost small" onClick={() => setGuide((guide) => guide.map((entry) => entry.id === section.id ? { ...entry, questions: [...entry.questions, { id: makeId("q"), text: "" }] } : entry))}><Plus size={14} /> Add question</button>
              </div>
            ))}
            {!study.guide.length && <p className="muted-text">No questions yet. Upload the guide above, or add sections by hand.</p>}
          </div>
        </section>

        {/* ---------------- 4. Participants ---------------- */}
        <section id="setup-people" className="card">
          <div className="card-head">
            <div><div className="eyebrow">Step 4</div><h2>Participants</h2><p>One row per interview (or group). Use codes like R01 or pseudonyms — avoid full names and phone numbers.</p></div>
          </div>
          <div className="row-actions">
            <Button icon={<Plus size={15} />} onClick={() => setParticipants((list) => [...list, blankParticipant(list.length, study.segments[0]?.id ?? null)])}>Add participant</Button>
            <Button icon={<FileText size={15} />} onClick={action(async () => {
              const [file] = await pickFile(".csv,text/csv");
              if (!file) return;
              const rows = parseCsv(await file.text());
              if (rows.length < 2) throw new Error("The CSV needs a header row and at least one participant.");
              setImportingPeople(rows);
            })}>Import recruitment list (CSV)</Button>
          </div>
          <div className="table-wrap">
            <table className="people-table">
              <thead><tr><th>Code</th><th>Name / pseudonym</th><th>Segment</th><th>City</th><th>Age</th><th>Gender</th><th>Session</th><th>Date</th><th>Notes</th><th /></tr></thead>
              <tbody>
                {study.participants.map((participant) => {
                  const set = (patch: Partial<Participant>) => setParticipants((list) => list.map((entry) => entry.id === participant.id ? { ...entry, ...patch } : entry));
                  return (
                    <tr key={participant.id}>
                      <td><input className="w-code" value={participant.code} onChange={(event) => set({ code: event.target.value })} aria-label="Code" /></td>
                      <td><input value={participant.name} onChange={(event) => set({ name: event.target.value })} aria-label="Name" /></td>
                      <td>
                        <select value={participant.segmentId ?? ""} onChange={(event) => set({ segmentId: event.target.value || null })} aria-label="Segment">
                          <option value="">—</option>
                          {study.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
                        </select>
                      </td>
                      <td><input value={participant.city} onChange={(event) => set({ city: event.target.value })} aria-label="City" /></td>
                      <td><input className="w-age" type="number" min={1} max={120} value={participant.age ?? ""} onChange={(event) => set({ age: event.target.value ? Number(event.target.value) : null })} aria-label="Age" /></td>
                      <td><input className="w-gender" value={participant.gender} onChange={(event) => set({ gender: event.target.value })} aria-label="Gender" /></td>
                      <td>
                        <select value={participant.sessionType} onChange={(event) => set({ sessionType: event.target.value })} aria-label="Session type">
                          {["IDI", "FGD", "Dyad", "Triad", "In-home", "Shop-along", "Ethnography", "Other"].map((type) => <option key={type}>{type}</option>)}
                        </select>
                      </td>
                      <td><input type="date" value={participant.sessionDate} onChange={(event) => set({ sessionDate: event.target.value })} aria-label="Session date" /></td>
                      <td><input value={participant.notes} onChange={(event) => set({ notes: event.target.value })} aria-label="Notes" /></td>
                      <td><button className="icon-btn danger" title="Remove participant" onClick={() => {
                        if (!window.confirm(`Remove ${participant.code} ${participant.name}? Their grid cells, notes and transcript will be deleted.`)) return;
                        void api.deleteTranscript(study.id, participant.id).catch(() => undefined);
                        update((current) => {
                          const grid = { ...current.grid };
                          delete grid[participant.id];
                          return {
                            ...current,
                            grid,
                            participants: current.participants.filter((entry) => entry.id !== participant.id),
                            observations: current.observations.filter((observation) => observation.participantId !== participant.id),
                          };
                        });
                      }}><Trash2 size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!study.participants.length && <p className="muted-text pad">No participants yet.</p>}
          </div>
        </section>
      </div>

      {importingPeople && (
        <CsvImport rows={importingPeople} segments={study.segments} onClose={() => setImportingPeople(null)} onImport={(people, newSegments) => {
          update((current) => ({ ...current, segments: [...current.segments, ...newSegments], participants: [...current.participants, ...people] }));
          setImportingPeople(null);
          notify(`Imported ${people.length} participants.`, "success");
        }} />
      )}
    </div>
  );
}

// Plain #anchors would clash with the app's hash-based navigation, so scroll explicitly.
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function move<T>(list: T[], index: number, delta: number) {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function blankParticipant(index: number, segmentId: string | null): Participant {
  return {
    id: makeId("p"), code: `R${String(index + 1).padStart(2, "0")}`, name: "", segmentId, city: "", age: null, gender: "",
    sessionType: "IDI", sessionDate: "", notes: "", media: [],
  };
}

const FIELDS = [
  { key: "code", label: "Code", guess: /^(code|id|resp(ondent)?\s*(id|no|code)?|r\.?\s*no)$/i },
  { key: "name", label: "Name / pseudonym", guess: /name|pseudonym/i },
  { key: "segment", label: "Segment", guess: /segment|cut|group|cell|quota|profile|user\s*type/i },
  { key: "city", label: "City", guess: /city|market|location|town/i },
  { key: "age", label: "Age", guess: /^age/i },
  { key: "gender", label: "Gender", guess: /gender|sex/i },
  { key: "sessionType", label: "Session type", guess: /method|type|format/i },
  { key: "sessionDate", label: "Date", guess: /date/i },
  { key: "notes", label: "Notes", guess: /note|comment|remark/i },
] as const;

function CsvImport({ rows, segments, onClose, onImport }: {
  rows: string[][]; segments: Segment[]; onClose: () => void; onImport: (people: Participant[], newSegments: Segment[]) => void;
}) {
  const [header, ...body] = rows;
  const [mapping, setMapping] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const field of FIELDS) {
      const index = header.findIndex((column, i) => field.guess.test(column.trim()) && !Object.values(result).includes(i));
      if (index >= 0) result[field.key] = index;
    }
    return result;
  });

  const run = () => {
    const known = new Map(segments.map((segment) => [segment.name.toLowerCase(), segment]));
    const created: Segment[] = [];
    const people = body.map((row, index) => {
      const value = (key: string) => mapping[key] !== undefined ? (row[mapping[key]] ?? "").trim() : "";
      const segmentName = value("segment");
      let segmentId: string | null = null;
      if (segmentName) {
        let segment = known.get(segmentName.toLowerCase());
        if (!segment) {
          segment = newSegment(segmentName, segments.length + created.length, { color: SEGMENT_COLORS[(segments.length + created.length) % SEGMENT_COLORS.length] });
          created.push(segment);
          known.set(segmentName.toLowerCase(), segment);
        }
        segmentId = segment.id;
      }
      const age = Number.parseInt(value("age"), 10);
      return {
        ...blankParticipant(index, segmentId),
        code: value("code") || `R${String(index + 1).padStart(2, "0")}`,
        name: value("name"),
        city: value("city"),
        age: Number.isFinite(age) ? age : null,
        gender: value("gender"),
        sessionType: value("sessionType") || "IDI",
        sessionDate: /^\d{4}-\d{2}-\d{2}$/.test(value("sessionDate")) ? value("sessionDate") : "",
        notes: [value("notes"), !/^\d{4}-\d{2}-\d{2}$/.test(value("sessionDate")) && value("sessionDate") ? `Session: ${value("sessionDate")}` : ""].filter(Boolean).join(" · "),
      };
    });
    onImport(people, created);
  };

  return (
    <Modal title={`Import ${body.length} participants`} eyebrow="Recruitment list" wide onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={run}>Import</Button>
    </>}>
      <p className="muted-text">Match your spreadsheet's columns. Unknown segment names become new segments.</p>
      <div className="form-grid">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => {
              const next = { ...current };
              if (event.target.value === "") delete next[field.key];
              else next[field.key] = Number(event.target.value);
              return next;
            })}>
              <option value="">— not in file —</option>
              {header.map((column, index) => <option key={index} value={index}>{column || `Column ${index + 1}`}</option>)}
            </select>
          </Field>
        ))}
      </div>
    </Modal>
  );
}
