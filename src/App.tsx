import { Settings2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicSettings } from "../shared/types";
import { api } from "./api";
import { LlmConnect, SttConnect } from "./components/ConnectAi";
import { Home } from "./components/Home";
import { Onboarding } from "./components/Onboarding";
import { type Tab, TABS, Workspace } from "./components/Workspace";
import { AppContext, Button, Modal, useToasts } from "./ui";

type Route = { studyId: string | null; tab: Tab };

function readRoute(): Route {
  const [, kind, id, tab] = window.location.hash.split("/");
  if (kind === "study" && id) return { studyId: decodeURIComponent(id), tab: TABS.some((entry) => entry.id === tab) ? tab as Tab : "setup" };
  return { studyId: null, tab: "setup" };
}

function writeRoute(route: Route) {
  window.location.hash = route.studyId ? `/study/${encodeURIComponent(route.studyId)}/${route.tab}` : "/";
}

export default function App() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [offline, setOffline] = useState(false);
  const [route, setRoute] = useState<Route>(readRoute);
  const [settingsTab, setSettingsTab] = useState<"ai" | "stt" | "data" | null>(null);
  const { notify, view: toasts } = useToasts();

  const load = useCallback(() => {
    api.settings().then((loaded) => { setSettings(loaded); setOffline(false); }).catch(() => setOffline(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (next: Route) => { writeRoute(next); setRoute(next); };

  const context = useMemo(() => settings && ({
    settings,
    setSettings,
    aiReady: Boolean(settings.llm.provider && (settings.llmKeySet || settings.llm.provider === "ollama" || settings.llm.provider === "openai-compatible")),
    sttReady: settings.stt.provider !== "none" && (settings.sttKeySet || settings.stt.provider === "openai-compatible"),
    notify,
    openSettings: (tab: "ai" | "stt" | "data" = "ai") => setSettingsTab(tab),
  }), [settings, notify]);

  if (offline) {
    return (
      <div className="center-message">
        <h2>Sweetleaf isn't running</h2>
        <p>This page needs the Sweetleaf program running on this computer. Start it with the “Start Sweetleaf” launcher (or <code>npm start</code>), then try again.</p>
        <Button variant="primary" onClick={load}>Try again</Button>
      </div>
    );
  }
  if (!settings || !context) return <div className="center-message">Loading…</div>;

  return (
    <AppContext.Provider value={context}>
      {!settings.onboarded ? (
        <Onboarding onDone={() => navigate({ studyId: null, tab: "setup" })} />
      ) : (
        <div className="app-shell">
          <header className="topbar">
            <button className="brand-wrap plain" onClick={() => navigate({ studyId: null, tab: "setup" })}>
              <div className="brand-mark">S</div>
              <div><div className="brand">Sweetleaf Suite</div><div className="brand-sub">Qualitative research workbench</div></div>
            </button>
            <div className="topbar-actions">
              <button className={`ai-status ${context.aiReady ? "on" : ""}`} onClick={() => setSettingsTab("ai")} title="AI connection">
                <Sparkles size={14} /> {context.aiReady ? `AI: ${settings.llm.model || settings.llm.provider}` : "AI not connected"}
              </button>
              <button className="icon-btn" onClick={() => setSettingsTab("ai")} title="Settings" aria-label="Settings"><Settings2 size={18} /></button>
            </div>
          </header>
          <main className="main-stage">
            {route.studyId ? (
              <Workspace
                key={route.studyId}
                studyId={route.studyId}
                tab={route.tab}
                onTab={(tab) => navigate({ ...route, tab })}
                onExit={() => navigate({ studyId: null, tab: "setup" })}
              />
            ) : (
              <Home onOpen={(studyId) => navigate({ studyId, tab: "setup" })} />
            )}
          </main>
        </div>
      )}

      {settingsTab && (
        <Modal title="Settings" eyebrow="Sweetleaf" wide onClose={() => setSettingsTab(null)}>
          <div className="settings-tabs">
            <button className={settingsTab === "ai" ? "active" : ""} onClick={() => setSettingsTab("ai")}>AI model</button>
            <button className={settingsTab === "stt" ? "active" : ""} onClick={() => setSettingsTab("stt")}>Transcription</button>
            <button className={settingsTab === "data" ? "active" : ""} onClick={() => setSettingsTab("data")}>Data & privacy</button>
          </div>
          {settingsTab === "ai" && <LlmConnect compact />}
          {settingsTab === "stt" && <SttConnect />}
          {settingsTab === "data" && (
            <div className="prose">
              <p><strong>Where your work lives:</strong> <code>{settings.dataDir}</code>. Each study is a folder with <code>study.json</code>, a <code>transcripts</code> folder and a <code>media</code> folder for recordings. Copy that folder to back everything up, including recordings.</p>
              <p><strong>Who can see it:</strong> Sweetleaf only accepts connections from this computer. There are no accounts and nothing is uploaded, except the text (or audio, for transcription) you send to the AI services you connect.</p>
              <p><strong>API keys</strong> are stored in <code>settings.json</code> in the same folder, readable only by your user account.</p>
              <p><strong>Move to another PC:</strong> on each study, use Topline → “Study backup (.json)”, then Import backup on the other machine; or copy the whole data folder.</p>
              <p>To use a different folder, start Sweetleaf with the environment variable <code>SWEETLEAF_DATA_DIR</code> set to that path.</p>
            </div>
          )}
        </Modal>
      )}
      {toasts}
    </AppContext.Provider>
  );
}
