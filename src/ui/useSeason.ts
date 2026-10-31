// Holds the season state. The engine mutates SeasonState in place, so the state
// lives in a ref and a version counter drives re-renders.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  allUnwatched,
  createSeason,
  isDone,
  loadSeasonData,
  seasonLabel,
  SEASON_IDS,
  type Difficulty,
  type RatingMode,
  type SeasonId,
  type SeasonState,
  type Step,
} from "../engine";
import { runOdds, runSim, type SimKind, type SimRequest, type SimResponse, type TeamOdds } from "./simWorker";
import { spoilers } from "./spoilers";
import { getSave, putSave, type SlotId } from "./saves";

export type { SimKind };

export interface SeasonConfig {
  seasonId: SeasonId;
  seed: string;
  ratingMode: RatingMode;
  /** Set for GM mode: the team the user runs. */
  gmTeam?: string;
  /** Play Champs only, from the real seeds. */
  champsOnly?: boolean;
  /** Hot and cold weekends: more upsets. */
  chaos?: boolean;
  /** GM difficulty. */
  difficulty?: Difficulty;
}

export interface SimOutcome {
  steps: Step[];
  /** Series ids played by this sim call, in order. */
  newSeries: string[];
  /** True when the sim stopped at a GM series waiting for the veto. */
  paused: boolean;
  /** GM series now waiting to be watched or skipped (spoiler-free match day). */
  matchDay: string[];
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8);

const SAVE_KIND = "cdl-sim-season";

const optionsOf = (cfg: SeasonConfig) => ({
  seed: cfg.seed,
  ratingMode: cfg.ratingMode,
  gmTeam: cfg.gmTeam,
  champsOnly: cfg.champsOnly,
  chaos: cfg.chaos,
  difficulty: cfg.gmTeam ? cfg.difficulty : undefined,
});

const configOf = (s: SeasonState): SeasonConfig => ({
  seasonId: s.seasonId,
  seed: s.options.seed,
  ratingMode: s.options.ratingMode,
  gmTeam: s.gm?.team,
  champsOnly: s.options.champsOnly,
  chaos: s.options.chaos,
  difficulty: s.options.difficulty,
});

/** A one-line description of a save. */
export function saveLabel(s: SeasonState): string {
  const data = loadSeasonData(s.seasonId);
  const who = s.gm ? (data.season.teams.find((t) => t.id === s.gm!.team)?.abbr ?? s.gm.team) : "Commissioner";
  return `${seasonLabel(s, data)} · ${who} · step ${s.next}/${s.steps.length}`;
}

export function useSeason(initial: SeasonConfig) {
  const [config, setConfig] = useState(initial);
  const stateRef = useRef<SeasonState | null>(null);
  if (!stateRef.current) {
    stateRef.current = createSeason(loadSeasonData(initial.seasonId), optionsOf(initial));
  }
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Live progress while a worker sim runs (the state itself only updates when it finishes). */
  const [progress, setProgress] = useState<{ next: number; total: number } | null>(null);
  const bump = () => setVersion((v) => v + 1);

  // The simulation runs in a Web Worker so the page stays responsive; if workers are
  // unavailable or fail, it runs inline exactly as before.
  const workerRef = useRef<Worker | null | undefined>(undefined);
  const reqId = useRef(0);
  const getWorker = (): Worker | null => {
    if (workerRef.current === undefined) {
      try {
        workerRef.current = new Worker(new URL("./simWorker.ts", import.meta.url), { type: "module" });
      } catch {
        workerRef.current = null;
      }
    }
    return workerRef.current;
  };

  const start = useCallback((cfg: SeasonConfig) => {
    const d = loadSeasonData(cfg.seasonId);
    stateRef.current = createSeason(d, optionsOf(cfg));
    setConfig(cfg);
    bump();
  }, []);

  const runInline = (kind: SimKind): Promise<SimOutcome> =>
    new Promise((resolve) => {
      // Next frame, so the "simulating" state can paint first.
      requestAnimationFrame(() =>
        setTimeout(() => {
          const s = stateRef.current!;
          const out = runSim(s, kind);
          resolve({ ...out, paused: !!s.pending, matchDay: allUnwatched(s) });
        }, 0),
      );
    });

  const runInWorker = (worker: Worker, kind: SimKind): Promise<SimOutcome> =>
    new Promise((resolve, reject) => {
      const id = ++reqId.current;
      const onMessage = (e: MessageEvent<SimResponse>) => {
        const msg = e.data;
        if (msg.id !== id) return;
        if (msg.type === "progress") {
          setProgress({ next: msg.next, total: msg.total });
          return;
        }
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (msg.type === "error") return reject(new Error(msg.message));
        if (msg.type !== "done") return;
        stateRef.current = msg.state;
        resolve({ steps: msg.steps, newSeries: msg.newSeries, paused: !!msg.state.pending, matchDay: allUnwatched(msg.state) });
      };
      const onError = (e: ErrorEvent) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(e.error ?? new Error(e.message));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id, kind, state: stateRef.current! } satisfies SimRequest);
    });

  const sim = useCallback(async (kind: SimKind): Promise<SimOutcome> => {
    setBusy(true);
    try {
      const worker = getWorker();
      if (worker) {
        try {
          return await runInWorker(worker, kind);
        } catch (err) {
          // The state on this side is untouched (the worker had a copy), so retry inline.
          console.warn("Simulation worker failed; running inline instead.", err);
          workerRef.current?.terminate();
          workerRef.current = null;
        }
      }
      return await runInline(kind);
    } finally {
      setBusy(false);
      setProgress(null);
      bump();
    }
  }, []);

  /** Swaps in a new season state (the next season of a dynasty). */
  const replace = useCallback((s: SeasonState) => {
    stateRef.current = s;
    setConfig(configOf(s));
    bump();
  }, []);

  /** Loads a save slot; resolves false if it's empty. */
  const load = useCallback(async (slot: SlotId): Promise<boolean> => {
    const rec = await getSave(slot);
    if (!rec) return false;
    stateRef.current = rec.state;
    setConfig(configOf(rec.state));
    bump();
    return true;
  }, []);

  const saveTo = useCallback((slot: SlotId) => putSave(slot, stateRef.current!, saveLabel(stateRef.current!)), []);

  // Autosave a moment after every change (not while a sim is running).
  const [autosaved, setAutosaved] = useState<string | null>(null);
  useEffect(() => {
    if (busy) return;
    const s = stateRef.current!;
    if (s.next === 0 && !s.gm) return; // nothing worth keeping yet
    const t = setTimeout(() => {
      putSave("autosave", s, saveLabel(s))
        .then(() => setAutosaved(new Date().toLocaleTimeString()))
        .catch(() => setAutosaved(null));
    }, 800);
    return () => clearTimeout(t);
  }, [version, busy]);

  /** Title odds from `runs` simulations of the rest of the season (in the worker when possible). */
  const odds = useCallback(
    (runs: number, onProgress?: (done: number) => void): Promise<TeamOdds[]> =>
      new Promise((resolve, reject) => {
        const worker = getWorker();
        const state = stateRef.current!;
        if (!worker) {
          setTimeout(() => {
            try {
              resolve(runOdds(state, runs, onProgress));
            } catch (e) {
              reject(e);
            }
          }, 0);
          return;
        }
        const id = ++reqId.current;
        const onMessage = (e: MessageEvent<SimResponse>) => {
          const msg = e.data;
          if (msg.id !== id) return;
          if (msg.type === "progress") return onProgress?.(msg.next);
          worker.removeEventListener("message", onMessage);
          if (msg.type === "odds") resolve(msg.odds);
          else if (msg.type === "error") reject(new Error(msg.message));
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ id, kind: "odds", runs, state } satisfies SimRequest);
      }),
    [],
  );

  const exportJson = useCallback(() => {
    const s = stateRef.current!;
    const blob = new Blob([JSON.stringify({ kind: SAVE_KIND, savedAt: new Date().toISOString(), state: s })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cdl-${s.seasonId}-${s.options.seed}-step${s.next}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJson = useCallback((text: string) => {
    const parsed = JSON.parse(text);
    const s = parsed?.kind === SAVE_KIND ? parsed.state : parsed;
    if (!s || s.version !== 1 || !SEASON_IDS.includes(s.seasonId) || !Array.isArray(s.steps) || typeof s.series !== "object") {
      throw new Error("Not a CDL Sim season file.");
    }
    stateRef.current = s as SeasonState;
    setConfig(configOf(s));
    bump();
  }, []);

  /** Applies a change to the season (GM actions) and re-renders. Returns an error message, if any. */
  const mutate = useCallback((fn: (s: SeasonState, d: ReturnType<typeof loadSeasonData>) => void): string | null => {
    const s = stateRef.current!;
    try {
      fn(s, loadSeasonData(s.seasonId));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      bump();
    }
  }, []);

  const state = stateRef.current!;
  return {
    mutate,
    config,
    data: loadSeasonData(state.seasonId),
    state,
    version,
    busy,
    progress,
    /** What the UI may reveal (spoiler-free match day). */
    spoil: spoilers(state, loadSeasonData(state.seasonId)),
    done: isDone(state),
    start,
    replace,
    odds,
    load,
    saveTo,
    autosaved,
    sim,
    exportJson,
    importJson,
  };
}

export type SeasonStore = ReturnType<typeof useSeason>;
