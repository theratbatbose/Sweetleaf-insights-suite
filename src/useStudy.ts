import { useCallback, useEffect, useRef, useState } from "react";
import type { Study } from "../shared/types";
import { api } from "./api";

export type SaveState = "saved" | "saving" | "unsaved" | "error";
export type UpdateStudy = (change: (study: Study) => Study) => void;

/** Loads a study and autosaves every change shortly after it is made. */
export function useStudy(studyId: string, onError: (message: string) => void) {
  const [study, setStudy] = useState<Study | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const latest = useRef<Study | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.study(studyId).then((loaded) => {
      if (cancelled) return;
      latest.current = loaded;
      setStudy(loaded);
    }).catch((error) => !cancelled && setLoadError(error.message));
    return () => { cancelled = true; };
  }, [studyId]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    setSaveState("saving");
    const snapshot = latest.current;
    inFlight.current = api.saveStudy(snapshot)
      .then(() => setSaveState(dirty.current ? "unsaved" : "saved"))
      .catch((error) => {
        dirty.current = true;
        setSaveState("error");
        onError(`Could not save: ${error.message}`);
      })
      .finally(() => { inFlight.current = null; });
    await inFlight.current;
  }, [onError]);

  const update: UpdateStudy = useCallback((change) => {
    setStudy((current) => {
      if (!current) return current;
      const next = change(current);
      latest.current = next;
      return next;
    });
    dirty.current = true;
    setSaveState("unsaved");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  return { study, loadError, saveState, update, flush };
}
