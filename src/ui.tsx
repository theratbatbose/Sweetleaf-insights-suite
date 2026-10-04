import { Loader2, Sparkles, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { PublicSettings } from "../shared/types";

// ---- app-wide context: settings + notifications ----

type Toast = { id: number; kind: "info" | "error" | "success"; text: string };

type AppContextValue = {
  settings: PublicSettings;
  setSettings: (settings: PublicSettings) => void;
  aiReady: boolean;
  sttReady: boolean;
  notify: (text: string, kind?: Toast["kind"]) => void;
  openSettings: (tab?: "ai" | "stt" | "data") => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppContext missing");
  return value;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    // Keep at most three on screen so they never cover the work.
    setToasts((list) => [...list, { id, kind, text }].slice(-3));
    window.setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), kind === "error" ? 9000 : 3500);
  }, []);
  const dismiss = (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id));
  const view = (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span>{toast.text}</span>
          <button onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
  return { notify, view };
}

// ---- primitives ----

export function Modal({ title, eyebrow, onClose, children, wide = false, footer }: {
  title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h3>{title}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-actions">{footer}</footer>}
      </section>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => unknown;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "normal";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  icon?: ReactNode;
};

/** A button that shows a spinner while its async handler runs. */
export function Button({ children, onClick, variant = "secondary", size = "normal", disabled, title, type = "button", icon }: ButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type={type}
      className={`btn ${variant} ${size}`}
      disabled={disabled || busy}
      title={title}
      onClick={async () => {
        if (!onClick) return;
        const result = onClick();
        if (result instanceof Promise) {
          setBusy(true);
          try { await result; } finally { setBusy(false); }
        }
      }}
    >
      {busy ? <Loader2 size={15} className="spin" /> : icon}
      {children}
    </button>
  );
}

/** An AI action. When no AI is connected it explains how to connect instead of failing. */
export function AiButton({ children, onClick, disabled, size = "normal", title, variant = "secondary" }: Omit<ButtonProps, "icon">) {
  const { aiReady, openSettings } = useApp();
  if (!aiReady) {
    return (
      <button type="button" className={`btn ai ${size} not-ready`} onClick={() => openSettings("ai")} title="Connect an AI provider to use this">
        <Sparkles size={15} /> {children}
      </button>
    );
  }
  return <Button variant={variant} size={size} disabled={disabled} onClick={onClick} title={title} icon={<Sparkles size={15} />}>{children}</Button>;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" aria-label={label}>
      <div className="progress-bar" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

/** Wraps an async action and reports failures as a toast. */
export function useAction() {
  const { notify } = useApp();
  return useCallback(<T,>(task: () => Promise<T>, success?: string) => async () => {
    try {
      const result = await task();
      if (success) notify(success, "success");
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return undefined;
    }
  }, [notify]);
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export function downloadText(filename: string, content: string, type = "text/plain") {
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
