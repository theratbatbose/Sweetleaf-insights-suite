import { CheckCircle2, Cloud, ExternalLink, HardDrive, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { LlmProviderId, PublicSettings, SttProviderId } from "../../shared/types";
import { api, type ProviderInfo } from "../api";
import { Button, Field, useApp } from "../ui";

const LOCAL_PROVIDERS = new Set(["ollama", "openai-compatible"]);

const PROVIDER_NOTES: Record<string, string> = {
  anthropic: "Claude models via an API key from the Anthropic Console. (Claude Pro/Max chat subscriptions can't be used by other apps.)",
  openai: "GPT models via an API key from the OpenAI Platform. (A ChatGPT Plus subscription is separate and does not include API access.)",
  gemini: "Gemini models via a free or paid key from Google AI Studio.",
  openrouter: "One key gives access to Claude, GPT, Gemini, Llama and more. Pay-as-you-go.",
  ollama: "Runs open models entirely on this computer. Nothing leaves the machine. Needs a reasonably powerful PC.",
  "openai-compatible": "Any server that speaks the OpenAI API: LM Studio, vLLM, Groq, Together, or your organisation's gateway.",
};

export function LlmConnect({ onSaved, compact = false }: { onSaved?: (settings: PublicSettings) => void; compact?: boolean }) {
  const { settings, setSettings, notify } = useApp();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<LlmProviderId | null>(settings.llm.provider);
  const [apiKey, setApiKey] = useState(settings.llm.apiKey);
  const [baseUrl, setBaseUrl] = useState(settings.llm.baseUrl);
  const [model, setModel] = useState(settings.llm.model);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { api.providers().then((data) => setProviders(data.llm)).catch(() => undefined); }, []);

  const info = providers.find((entry) => entry.id === provider);
  const sameProvider = provider === settings.llm.provider;
  const draft = { provider, apiKey: sameProvider ? apiKey : apiKey.startsWith("••••") ? "" : apiKey, baseUrl, model };

  const choose = (id: LlmProviderId) => {
    setProvider(id);
    setStatus(null);
    setModels([]);
    if (id === settings.llm.provider) {
      setApiKey(settings.llm.apiKey);
      setBaseUrl(settings.llm.baseUrl);
      setModel(settings.llm.model);
    } else {
      setApiKey("");
      setBaseUrl("");
      setModel(providers.find((entry) => entry.id === id)?.defaultModel ?? "");
    }
  };

  const loadModels = async () => {
    try {
      const { models: list } = await api.listModels(draft);
      setModels(list);
      if (!list.length) notify("No models found. For Ollama, download one first, e.g. `ollama pull qwen3`.", "info");
      else if (!model || !list.includes(model)) setModel(list[0]);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const test = async () => {
    setStatus(null);
    try {
      const { reply } = await api.testLlm(draft);
      setStatus({ ok: true, text: `Connected. The model replied: “${reply}”` });
    } catch (error) {
      setStatus({ ok: false, text: (error as Error).message });
    }
  };

  const save = async () => {
    const saved = await api.saveSettings({ llm: { provider, apiKey: draft.apiKey, baseUrl, model } });
    setSettings(saved);
    setApiKey(saved.llm.apiKey);
    notify("AI connection saved.", "success");
    onSaved?.(saved);
  };

  return (
    <div className="connect">
      <div className={`provider-grid ${compact ? "compact" : ""}`}>
        {providers.map((entry) => (
          <button key={entry.id} type="button" className={`provider-card ${provider === entry.id ? "selected" : ""}`} onClick={() => choose(entry.id as LlmProviderId)}>
            <div className="provider-top">
              <strong>{entry.label}</strong>
              {LOCAL_PROVIDERS.has(entry.id) ? <span className="pill local"><HardDrive size={12} /> Local</span> : <span className="pill"><Cloud size={12} /> Cloud</span>}
            </div>
            {!compact && <p>{PROVIDER_NOTES[entry.id]}</p>}
          </button>
        ))}
      </div>

      {info && (
        <div className="connect-form">
          {info.needsKey !== false || provider === "openai-compatible" ? (
            <Field label={provider === "openai-compatible" ? "API key (if the server needs one)" : "API key"} hint={info.keyUrl ? undefined : "Leave empty for local servers."}>
              <div className="input-row">
                <KeyRound size={16} />
                <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your key" autoComplete="off" spellCheck={false} />
                {info.keyUrl && <a className="link" href={info.keyUrl} target="_blank" rel="noreferrer">Get a key <ExternalLink size={13} /></a>}
              </div>
            </Field>
          ) : (
            <p className="hint-box">Install Ollama from <a className="link" href={info.keyUrl} target="_blank" rel="noreferrer">ollama.com</a>, then download a model (for example <code>ollama pull qwen3</code>). Sweetleaf talks to it on this computer.</p>
          )}
          {(LOCAL_PROVIDERS.has(info.id)) && (
            <Field label="Server address" hint={`Default: ${info.defaultBaseUrl}`}>
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={info.defaultBaseUrl} spellCheck={false} />
            </Field>
          )}
          <Field label="Model" hint={info.defaultModel ? `Suggested: ${info.defaultModel}. Larger models give better analysis but cost more.` : "Load the list to choose a model."}>
            <div className="input-row">
              <input list="model-options" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model name" spellCheck={false} />
              <datalist id="model-options">{models.map((entry) => <option key={entry} value={entry} />)}</datalist>
              <Button size="small" onClick={loadModels}>Load models</Button>
            </div>
          </Field>
          {status && <div className={`status-line ${status.ok ? "ok" : "bad"}`}>{status.ok && <CheckCircle2 size={15} />} {status.text}</div>}
          <div className="row-actions">
            <Button onClick={test}>Test connection</Button>
            <Button variant="primary" onClick={save}>Save AI connection</Button>
          </div>
          {!LOCAL_PROVIDERS.has(info.id) && (
            <p className="privacy-note">When you use an AI action, the text needed for it (for example a transcript) is sent to {info.label.replace(/ \(.*\)/, "")} under your own account. Recordings are never sent to the AI model. Check that your client agreements allow this, or choose a local option.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SttConnect({ onSaved }: { onSaved?: (settings: PublicSettings) => void }) {
  const { settings, setSettings, notify } = useApp();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<SttProviderId>(settings.stt.provider);
  const [apiKey, setApiKey] = useState(settings.stt.apiKey);
  const [baseUrl, setBaseUrl] = useState(settings.stt.baseUrl);
  const [model, setModel] = useState(settings.stt.model);
  const [language, setLanguage] = useState(settings.stt.language);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { api.providers().then((data) => setProviders(data.stt)).catch(() => undefined); }, []);
  const info = providers.find((entry) => entry.id === provider);

  const choose = (id: SttProviderId) => {
    setProvider(id);
    setStatus(null);
    const same = id === settings.stt.provider;
    setApiKey(same ? settings.stt.apiKey : "");
    setBaseUrl(same ? settings.stt.baseUrl : "");
    setModel(same ? settings.stt.model : providers.find((entry) => entry.id === id)?.defaultModel ?? "");
  };

  const draft = { provider, apiKey, baseUrl, model, language };

  return (
    <div className="connect">
      <div className="provider-grid compact">
        <button type="button" className={`provider-card ${provider === "none" ? "selected" : ""}`} onClick={() => choose("none")}>
          <div className="provider-top"><strong>No automatic transcription</strong><span className="pill local"><HardDrive size={12} /> Local</span></div>
          <p>Import transcripts you already have (Word, TXT, SRT, VTT, CSV).</p>
        </button>
        {providers.map((entry) => (
          <button key={entry.id} type="button" className={`provider-card ${provider === entry.id ? "selected" : ""}`} onClick={() => choose(entry.id as SttProviderId)}>
            <div className="provider-top">
              <strong>{entry.label}</strong>
              {entry.id === "openai-compatible" ? <span className="pill local"><HardDrive size={12} /> Local</span> : <span className="pill"><Cloud size={12} /> Cloud</span>}
            </div>
          </button>
        ))}
      </div>
      {info && provider !== "none" && (
        <div className="connect-form">
          <Field label="API key" hint={provider === "openai-compatible" ? "Leave empty for local servers." : undefined}>
            <div className="input-row">
              <KeyRound size={16} />
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your key" autoComplete="off" spellCheck={false} />
              {info.keyUrl && <a className="link" href={info.keyUrl} target="_blank" rel="noreferrer">Get a key <ExternalLink size={13} /></a>}
            </div>
          </Field>
          {provider === "openai-compatible" && (
            <Field label="Server address" hint={`Default: ${info.defaultBaseUrl}`}>
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={info.defaultBaseUrl} spellCheck={false} />
            </Field>
          )}
          <Field label="Model" hint={`Default: ${info.defaultModel}${provider === "openai" ? " (labels speakers). Use whisper-1 if it fails on long or non-English audio." : ""}`}>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder={info.defaultModel} spellCheck={false} />
          </Field>
          <Field label="Main interview language (optional)" hint="ISO code such as hi (Hindi), ta (Tamil), en. Leave empty to auto-detect — best for Hinglish.">
            <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="auto" spellCheck={false} />
          </Field>
          {status && <div className={`status-line ${status.ok ? "ok" : "bad"}`}>{status.ok && <CheckCircle2 size={15} />} {status.text}</div>}
          <div className="row-actions">
            <Button onClick={async () => {
              setStatus(null);
              try { await api.testStt(draft); setStatus({ ok: true, text: "Connected." }); }
              catch (error) { setStatus({ ok: false, text: (error as Error).message }); }
            }}>Test connection</Button>
            <Button variant="primary" onClick={async () => {
              const saved = await api.saveSettings({ stt: draft });
              setSettings(saved);
              setApiKey(saved.stt.apiKey);
              notify("Transcription settings saved.", "success");
              onSaved?.(saved);
            }}>Save transcription</Button>
          </div>
          <p className="privacy-note">Transcription sends the interview audio (not video) to this service. Audio is split into 10-minute parts automatically.</p>
        </div>
      )}
      {provider === "none" && settings.stt.provider !== "none" && (
        <div className="row-actions">
          <Button variant="primary" onClick={async () => { const saved = await api.saveSettings({ stt: { provider: "none" } }); setSettings(saved); onSaved?.(saved); }}>Turn off transcription</Button>
        </div>
      )}
    </div>
  );
}
