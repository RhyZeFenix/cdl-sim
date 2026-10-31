/// <reference lib="webworker" />
// Runs simulation steps off the main thread. The page sends the season state and a
// command; the worker advances it, reports progress after each step, and sends the
// new state back. The engine is the same code the page would run inline.
import { advance, isDone, isMatchDay, loadSeasonData, type SeasonState, type Step } from "../engine";

export type SimKind = "step" | "stage" | "season";

export type SimRequest = { id: number; kind: SimKind; state: SeasonState };
export type SimResponse =
  | { id: number; type: "progress"; next: number; total: number }
  | { id: number; type: "done"; state: SeasonState; steps: Step[]; newSeries: string[] }
  | { id: number; type: "error"; message: string };

/**
 * Same stopping rules as advance / advanceStage / advanceSeason, plus a stop at the GM
 * team's match day (spoiler-free), with a progress callback.
 */
export function runSim(state: SeasonState, kind: SimKind, onStep?: (s: SeasonState) => void) {
  const data = loadSeasonData(state.seasonId);
  const before = new Set(Object.keys(state.series));
  const from = state.next;
  while (!isDone(state) && !isMatchDay(state)) {
    const step = advance(state, data);
    onStep?.(state);
    // Spoiler-free match day: stop as soon as the GM team has a result to watch.
    if (!step || kind === "step" || isMatchDay(state)) break;
    if (kind === "stage" && (step.kind === "major" || step.kind === "championship")) break;
  }
  return {
    steps: state.steps.slice(from, state.next),
    newSeries: Object.keys(state.series).filter((id) => !before.has(id)),
  };
}

// Only wire up the message handler when actually running inside a worker.
if (typeof self !== "undefined" && typeof (self as unknown as { importScripts?: unknown }).importScripts === "function") {
  const ctx = self as unknown as DedicatedWorkerGlobalScope;
  ctx.onmessage = (e: MessageEvent<SimRequest>) => {
    const { id, kind, state } = e.data;
    try {
      const out = runSim(state, kind, (s) => ctx.postMessage({ id, type: "progress", next: s.next, total: s.steps.length } satisfies SimResponse));
      ctx.postMessage({ id, type: "done", state, ...out } satisfies SimResponse);
    } catch (err) {
      ctx.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) } satisfies SimResponse);
    }
  };
}
