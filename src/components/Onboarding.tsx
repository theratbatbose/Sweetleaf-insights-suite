import { ArrowRight, HardDrive, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { Button, useApp } from "../ui";
import { LlmConnect, SttConnect } from "./ConnectAi";

const STEPS = ["Welcome", "Connect your AI", "Transcription", "Ready"];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { settings, setSettings, aiReady, sttReady } = useApp();
  const [step, setStep] = useState(0);

  const finish = async () => {
    setSettings(await api.saveSettings({ onboarded: true }));
    onDone();
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="brand-wrap"><div className="brand-mark">S</div><div><div className="brand">Sweetleaf Suite</div><div className="brand-sub">Qualitative research workbench</div></div></div>
        <ol className="stepper">
          {STEPS.map((label, index) => <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>{label}</li>)}
        </ol>

        {step === 0 && (
          <div className="onboarding-body">
            <h1>Your whole study, from discussion guide to topline, on this computer.</h1>
            <div className="feature-list">
              <div><HardDrive size={18} /><p><strong>Runs locally.</strong> No login, no cloud account. Studies, recordings and transcripts are saved in <code>{settings.dataDir}</code>.</p></div>
              <div><Sparkles size={18} /><p><strong>Bring your own AI.</strong> Connect Claude, GPT, Gemini, OpenRouter — or a model running on this PC with Ollama. AI drafts; you decide.</p></div>
              <div><ShieldCheck size={18} /><p><strong>Evidence first.</strong> Every AI quote is checked against the transcript and flagged if it can't be found.</p></div>
            </div>
            <div className="row-actions"><Button variant="primary" onClick={() => setStep(1)} icon={<ArrowRight size={15} />}>Get started</Button></div>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-body">
            <h2>Connect your AI</h2>
            <p className="lead">AI helps structure your discussion guide, fill the analysis grid, summarise segments and draft the topline. Choose a provider you already pay for, or a local model. You can change this any time in Settings.</p>
            <LlmConnect />
            <div className="row-actions spread">
              <Button variant="ghost" onClick={() => setStep(2)}>Skip — I'll work without AI for now</Button>
              <Button variant="primary" disabled={!aiReady} onClick={() => setStep(2)} icon={<ArrowRight size={15} />}>Continue</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <h2>Automatic transcription (optional)</h2>
            <p className="lead">Sweetleaf can turn interview recordings into timestamped transcripts. If your transcripts come from a vendor, skip this and import them as Word or text files.</p>
            <SttConnect />
            <div className="row-actions spread">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(3)} icon={<ArrowRight size={15} />}>{sttReady ? "Continue" : "Skip for now"}</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-body">
            <h2>You're set up.</h2>
            <ul className="checklist">
              <li className={aiReady ? "ok" : ""}>{aiReady ? `AI connected: ${settings.llm.model || settings.llm.provider}` : "No AI connected — manual analysis works fully; AI buttons will prompt you to connect."}</li>
              <li className={sttReady ? "ok" : ""}>{sttReady ? "Automatic transcription is on." : "Transcripts will be imported from files."}</li>
              <li className="ok">Studies are saved in {settings.dataDir}</li>
            </ul>
            <p className="lead">The workflow: <strong>Setup</strong> (brief, segments, discussion guide, participants) → <strong>Sessions</strong> (recordings, transcripts, notes) → <strong>Grid</strong> (respondent × question) → <strong>Segments</strong> → <strong>Inference</strong> → <strong>Topline</strong>.</p>
            <div className="row-actions"><Button variant="primary" onClick={finish} icon={<ArrowRight size={15} />}>Open my studies</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
