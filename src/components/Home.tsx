import { FolderOpen, Plus, Trash2, Upload, Users, ListChecks, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import type { StudySummary } from "../../shared/types";
import { api } from "../api";
import { Button, EmptyState, Field, Modal, pickFile, useApp } from "../ui";

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const { notify, settings } = useApp();
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const refresh = () => api.studies().then(setStudies).catch((error) => notify(error.message, "error"));
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    const study = await api.createStudy(name.trim() || "Untitled study");
    setCreating(false);
    setName("");
    onOpen(study.id);
  };

  const importBackup = async () => {
    const [file] = await pickFile(".json,application/json");
    if (!file) return;
    try {
      const study = await api.importStudy(JSON.parse(await file.text()));
      notify(`Imported “${study.name}”. Recordings are not included in backups — re-attach them in Sessions.`, "success");
      onOpen(study.id);
    } catch (error) {
      notify(error instanceof SyntaxError ? "That file is not valid JSON." : (error as Error).message, "error");
    }
  };

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <div className="eyebrow">Your studies</div>
          <h1>Studies on this computer</h1>
          <p className="muted-text"><FolderOpen size={14} /> Saved in {settings.dataDir}</p>
        </div>
        <div className="row-actions">
          <Button onClick={importBackup} icon={<Upload size={15} />}>Import backup</Button>
          <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus size={15} />}>New study</Button>
        </div>
      </div>

      {studies && studies.length === 0 && (
        <EmptyState icon={<BookOpen size={28} />} title="Start your first study">
          <p>Create a study and add your brief, screener and discussion guide. Or open the demo study (fictional data) to try every feature first.</p>
          <div className="row-actions center">
            <Button onClick={async () => { const study = await api.createSample(); onOpen(study.id); }}>Open the demo study</Button>
            <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus size={15} />}>New study</Button>
          </div>
        </EmptyState>
      )}

      <div className="study-list">
        {studies?.map((study) => (
          <div key={study.id} className="study-card" role="button" tabIndex={0} onClick={() => onOpen(study.id)} onKeyDown={(event) => { if (event.key === "Enter") onOpen(study.id); }}>
            <div>
              <h3>{study.demo && <span className="chip demo">Demo</span>} {study.name}</h3>
              <p>{study.client || "No client set"}</p>
            </div>
            <div className="study-card-meta">
              <span><Users size={13} /> {study.participantCount} participants</span>
              <span><ListChecks size={13} /> {study.questionCount} guide questions</span>
              <span>Edited {new Date(study.updatedAt).toLocaleString()}</span>
            </div>
            <button className="icon-btn danger" title="Delete study" onClick={async (event) => {
              event.stopPropagation();
              if (!window.confirm(`Delete “${study.name}” and all its recordings and transcripts from this computer? This cannot be undone.`)) return;
              await api.deleteStudy(study.id);
              refresh();
            }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {studies && studies.length > 0 && !studies.some((study) => study.demo) && (
        <div className="home-foot"><Button variant="ghost" size="small" onClick={async () => { const study = await api.createSample(); onOpen(study.id); }}>Add the demo study</Button></div>
      )}

      {creating && (
        <Modal title="New study" eyebrow="Create" onClose={() => setCreating(false)} footer={<>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" onClick={create}>Create study</Button>
        </>}>
          <form onSubmit={(event) => { event.preventDefault(); create(); }}>
            <Field label="Study name" hint="e.g. “Haircare usage & attitudes — Tier 2 cities”">
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
