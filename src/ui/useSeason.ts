// Holds the season state. The engine mutates SeasonState in place, so the state
// lives in a ref and a version counter drives re-renders.
import { useCallback, useRef, useState } from "react";
import {
  advance,
  advanceSeason,
  advanceStage,
  createSeason,
  isDone,
  loadSeasonData,
  SEASON_IDS,
  type RatingMode,
  type SeasonId,
  type SeasonState,
  type Step,
} from "../engine";

export interface SeasonConfig {
  seasonId: SeasonId;
  seed: string;
  ratingMode: RatingMode;
  /** Set for GM mode: the team the user runs. */
  gmTeam?: string;
}

export type SimKind = "step" | "stage" | "season";

export interface SimOutcome {
  steps: Step[];
  /** Series ids played by this sim call, in order. */
  newSeries: string[];
  /** True when the sim stopped at a GM series waiting for the veto. */
  paused: boolean;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8);

const SAVE_KIND = "cdl-sim-season";

const optionsOf = (cfg: SeasonConfig) => ({ seed: cfg.seed, ratingMode: cfg.ratingMode, gmTeam: cfg.gmTeam });

export function useSeason(initial: SeasonConfig) {
  const [config, setConfig] = useState(initial);
  const stateRef = useRef<SeasonState | null>(null);
  if (!stateRef.current) {
    stateRef.current = createSeason(loadSeasonData(initial.seasonId), optionsOf(initial));
  }
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const bump = () => setVersion((v) => v + 1);

  const start = useCallback((cfg: SeasonConfig) => {
    const d = loadSeasonData(cfg.seasonId);
    stateRef.current = createSeason(d, optionsOf(cfg));
    setConfig(cfg);
    bump();
  }, []);

  /** Runs on the next frame so the "simulating" state can paint first. */
  const sim = useCallback(
    (kind: SimKind): Promise<SimOutcome> =>
      new Promise((resolve) => {
        setBusy(true);
        requestAnimationFrame(() =>
          setTimeout(() => {
            const s = stateRef.current!;
            const d = loadSeasonData(s.seasonId);
            const before = new Set(Object.keys(s.series));
            const from = s.next;
            if (kind === "step") advance(s, d);
            else if (kind === "stage") advanceStage(s, d);
            else advanceSeason(s, d);
            const newSeries = Object.keys(s.series).filter((id) => !before.has(id));
            setBusy(false);
            bump();
            resolve({ steps: s.steps.slice(from, s.next), newSeries, paused: !!s.pending });
          }, 0),
        );
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
    setConfig({ seasonId: s.seasonId, seed: s.options.seed, ratingMode: s.options.ratingMode, gmTeam: s.gm?.team });
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
    done: isDone(state),
    start,
    sim,
    exportJson,
    importJson,
  };
}

export type SeasonStore = ReturnType<typeof useSeason>;
