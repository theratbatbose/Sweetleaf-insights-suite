import { AlertTriangle, CheckCircle2, Cloud, ExternalLink, HardDrive, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LlmProviderId, PublicSettings, SttProviderId } from "../../shared/types";
import { api, type ProviderInfo } from "../api";
import { Button, Field, useApp } from "../ui";

const LOCAL_PROVIDERS = new Set(["ollama", "openai-compatible"]);
const MAIN_PROVIDERS = ["anthropic", "openai", "gemini"];

type Guide = { name: string; blurb: string; url: string; site: string; steps: string[]; keyHint: string; keyPattern?: RegExp };

const GUIDES: Record<string, Guide> = {
  anthropic: {
    name: "Claude", blurb: "by Anthropic", url: "https://console.anthropic.com/settings/keys", site: "console.anthropic.com",
    steps: ["Sign in or sign up (this is separate from a Claude Pro subscription).", "Go to Settings → API keys → Create key.", "Add some credit under Billing. The key won't work without it.", "Copy the key."],
    keyHint: "Starts with sk-ant-", keyPattern: /^sk-ant-/,
  },
  openai: {
    name: "ChatGPT models", blurb: "by OpenAI", url: "https://platform.openai.com/api-keys", site: "platform.openai.com",
    steps: ["Sign in at the OpenAI Platform (separate from ChatGPT Plus).", "Click Create new secret key.", "Add some credit under Settings → Billing.", "Copy the key."],
    keyHint: "Starts with sk-", keyPattern: /^sk-/,
  },
  gemini: {
    name: "Gemini", blurb: "by Google", url: "https://aistudio.google.com/apikey", site: "aistudio.google.com",
    steps: ["Sign in with your Google account.", "Click Create API key.", "For client work, set up billing: on the free tier Google may use your prompts to improve its products.", "Copy the key."],
    keyHint: "Starts with AIza", keyPattern: /^AIza/,
  },
  openrouter: {
    name: "OpenRouter", blurb: "one key, many AI models", url: "https://openrouter.ai/keys", site: "openrouter.ai",
    steps: ["Sign in at openrouter.ai.", "Add some credit.", "Create a key and copy it."],
    keyHint: "Starts with sk-or-", keyPattern: /^sk-or-/,
  },
  ollama: {
    name: "Ollama", blurb: "free, runs on this computer", url: "https://ollama.com/download", site: "ollama.com",
    steps: ["Download and install Ollama.", "Open a terminal and run:  ollama pull qwen3", "Leave Ollama running, then click Connect below."],
    keyHint: "",
  },
  "openai-compatible": {
    name: "Your own server", blurb: "LM Studio, Groq, your company's AI gateway…", url: "", site: "",
    steps: ["Enter the server address under Advanced (for LM Studio, start its local server first).", "Paste a key if the server needs one."],
    keyHint: "",
  },
};

function cleanKey(value: string) {
  return value.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, "");
}

export function LlmConnect({ onSaved, compact = false }: { onSaved?: (settings: PublicSettings) => void; compact?: boolean }) {
  const { settings, setSettings, notify, aiReady } = useApp();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [editing, setEditing] = useState(!aiReady);
  const [provider, setProvider] = useState<LlmProviderId | null>(settings.llm.provider);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(settings.llm.baseUrl);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [proxy, setProxy] = useState(settings.proxy ?? "");
  const [more, setMore] = useState(Boolean(settings.llm.provider && !MAIN_PROVIDERS.includes(settings.llm.provider)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { api.providers().then((data) => setProviders(data.llm)).catch(() => undefined); }, []);

  const info = providers.find((entry) => entry.id === provider);
  const guide = provider ? GUIDES[provider] : null;
  const keySaved = provider === settings.llm.provider && settings.llmKeySet;
  const needsKey = provider !== "ollama" && provider !== "openai-compatible";
  const key = cleanKey(apiKey);
  const keyWarning = key && guide?.keyPattern && !guide.keyPattern.test(key)
    ? `This doesn't look like a ${guide.name} API key (${guide.keyHint.toLowerCase()}). Check you copied the API key, not a password or chat login.`
    : "";

  const choose = (id: LlmProviderId) => {
    setProvider(id);
    setResult(null);
    setModels([]);
    setApiKey("");
    setModel(id === settings.llm.provider ? settings.llm.model : "");
    setBaseUrl(id === settings.llm.provider ? settings.llm.baseUrl : "");
  };

  const draft = () => ({ provider, apiKey: key || undefined, baseUrl, model });

  const connect = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (proxy !== (settings.proxy ?? "")) setSettings(await api.saveSettings({ proxy }));
      const { settings: saved, model: chosen } = await api.connectLlm(draft());
      setSettings(saved);
      setModel(chosen);
      setApiKey("");
      setResult({ ok: true, text: `Connected to ${guide?.name ?? "your AI"} using the model “${chosen}”.` });
      notify("AI connected.", "success");
      onSaved?.(saved);
      window.setTimeout(() => setEditing(false), 1200);
    } catch (error) {
      setResult({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const loadModels = async () => {
    try {
      const { models: list } = await api.listModels(draft());
      setModels(list);
      if (!list.length) notify("No models found for this key.", "info");
    } catch (error) {
      setResult({ ok: false, text: (error as Error).message });
    }
  };

  if (!editing && aiReady) {
    const current = GUIDES[settings.llm.provider ?? ""];
    return (
      <div className="connected-card">
        <CheckCircle2 size={22} />
        <div>
          <strong>Connected to {current?.name ?? settings.llm.provider}</strong>
          <span>Model: {settings.llm.model}</span>
        </div>
        <span className="spacer" />
        <Button onClick={async () => {
          try { const { reply } = await api.testLlm({}); notify(`Still connected. The AI replied “${reply}”.`, "success"); }
          catch (error) { notify((error as Error).message, "error"); }
        }}>Test again</Button>
        <Button onClick={() => setEditing(true)}>Change</Button>
      </div>
    );
  }

  const providerButton = (id: string) => {
    const entry = GUIDES[id];
    return (
      <button key={id} type="button" className={`provider-card ${provider === id ? "selected" : ""}`} onClick={() => choose(id as LlmProviderId)}>
        <div className="provider-top">
          <strong>{entry.name}</strong>
          {LOCAL_PROVIDERS.has(id) ? <span className="pill local"><HardDrive size={12} /> On this PC</span> : <span className="pill"><Cloud size={12} /> Online</span>}
        </div>
        <p>{entry.blurb}</p>
      </button>
    );
  };

  return (
    <div className="connect">
      <div className="field-label">1. Which AI do you use?</div>
      <div className={`provider-grid ${compact ? "compact" : ""}`}>
        {MAIN_PROVIDERS.map(providerButton)}
        {more && ["openrouter", "ollama", "openai-compatible"].map(providerButton)}
      </div>
      {!more && <button className="link-btn" onClick={() => setMore(true)}>More options (OpenRouter, Ollama on this PC, other servers)</button>}

      {guide && info && (
        <div className="connect-steps">
          <div className="connect-step">
            <div className="field-label">2. {needsKey ? `Get your ${guide.name} API key` : "Get ready"}</div>
            <ol className="guide-steps">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            {guide.url && <a className="btn secondary" href={guide.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open {guide.site}</a>}
          </div>

          <div className="connect-step">
            <div className="field-label">3. {needsKey ? "Paste the key and connect" : "Connect"}</div>
            {(needsKey || provider === "openai-compatible") && (
              <div className="input-row">
                <KeyRound size={16} />
                <input
                  className="key-input"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={keySaved ? "A key is saved. Paste a new one to replace it" : provider === "openai-compatible" ? "Key (only if the server needs one)" : `Paste your key here${guide.keyHint ? ` (${guide.keyHint.toLowerCase()})` : ""}`}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="API key"
                />
                <button type="button" className="link-btn" onClick={() => setShowKey(!showKey)}>{showKey ? "Hide" : "Show"}</button>
              </div>
            )}
            {keyWarning && <div className="status-line warn-line">{keyWarning}</div>}
            <div className="row-actions">
              <Button variant="primary" disabled={busy || (needsKey && !key && !keySaved)} onClick={connect}>{busy ? "Connecting…" : "Connect"}</Button>
              {busy && <span className="muted-text small"><Loader2 size={14} className="spin" /> Checking the key, choosing a model and sending a test message…</span>}
            </div>
            {result && (
              <div className={`status-line ${result.ok ? "ok" : "bad"}`}>
                {result.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <div>
                  <div>{result.text}</div>
                  {!result.ok && (
                    <ul className="try-list">
                      <li>Copy the key again from {guide.site || "the provider"}, the whole thing, and paste it in.</li>
                      {needsKey && <li>Check the account has credit or billing set up.</li>}
                      <li>On an office network or VPN, try a phone hotspot to see if the network is blocking it. You can set a proxy under Advanced.</li>
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <details className="advanced">
            <summary>Advanced: model, server address, proxy</summary>
            <Field label="Model" hint="Leave empty and Sweetleaf picks a good one for you.">
              <div className="input-row">
                <input list="model-options" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Automatic" spellCheck={false} />
                <datalist id="model-options">{models.map((entry) => <option key={entry} value={entry} />)}</datalist>
                <Button size="small" onClick={loadModels}>Show available models</Button>
              </div>
            </Field>
            {LOCAL_PROVIDERS.has(info.id) && (
              <Field label="Server address" hint={`Default: ${info.defaultBaseUrl}`}>
                <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={info.defaultBaseUrl} spellCheck={false} />
              </Field>
            )}
            <Field label="Proxy (only if your office network needs one)" hint={settings.network.proxy
              ? `Currently using ${settings.network.proxy} (${settings.network.proxySource === "windows" ? "from Windows settings" : settings.network.proxySource === "environment" ? "from this computer's settings" : "set here"}).`
              : "None detected. Ask IT for the address, e.g. http://proxy.company.com:8080"}>
              <input value={proxy} onChange={(event) => setProxy(event.target.value)} placeholder="Automatic" spellCheck={false} />
            </Field>
          </details>

          {!LOCAL_PROVIDERS.has(info.id) && (
            <p className="privacy-note">When you use an AI button, the text it needs (for example a transcript) is sent to {guide.name} under your own account. Recordings are never sent to the AI model. Check this fits your client agreements, or choose Ollama to keep everything on this computer.</p>
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
          <p>Import transcripts you already have (Word, PDF, Excel, TXT, SRT, VTT, CSV).</p>
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
