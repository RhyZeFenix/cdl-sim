/// <reference lib="webworker" />
// Runs simulation steps off the main thread. The page sends the season state and a
// command; the worker advances it, reports progress after each step, and sends the
// new state back. The engine is the same code the page would run inline.
import { advance, advanceSeason, isDone, isMatchDay, loadSeasonData, pointsTable, type SeasonState, type Step } from "../engine";

import { runHeatmap, type HeatRequest, type Heatmap } from "./heatmap";
import { setLayoutOverride } from "./replay/layouts";
import type { Traced } from "./replay/shapes";

export type SimKind = "step" | "stage" | "season";

export type SimRequest =
  | { id: number; kind: SimKind; state: SeasonState }
  | { id: number; kind: "odds"; runs: number; offset: number; state: SeasonState }
  | { id: number; kind: "heatmap"; req: HeatRequest; state: SeasonState; overrides: Record<string, Traced> };
export type SimResponse =
  | { id: number; type: "progress"; next: number; total: number }
  | { id: number; type: "odds"; odds: TeamOdds[]; runs: number }
  | { id: number; type: "heatmap"; heat: Heatmap }
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

export interface TeamOdds {
  team: string;
  /** Shares of runs, 0-1. */
  makeChamps: number;
  winChamps: number;
  winMajor: number;
  avgPoints: number;
  avgRank: number;
}

/**
 * Plays the rest of the season `runs` times with different luck for the unplayed series
 * (played results stay as they are) and counts how often each team finishes where.
 */
export function runOdds(state: SeasonState, runs: number, onRun?: (done: number) => void, offset = 0): TeamOdds[] {
  const data = loadSeasonData(state.seasonId);
  const acc = new Map<string, TeamOdds>(data.season.teams.map((t) => [t.id, { team: t.id, makeChamps: 0, winChamps: 0, winMajor: 0, avgPoints: 0, avgRank: 0 }]));
  const base = JSON.stringify(state);
  for (let i = 0; i < runs; i++) {
    const s = JSON.parse(base) as SeasonState;
    // New luck for everything still to play; GM decisions go to the AI.
    s.options = { ...s.options, seed: `${state.options.seed}~odds${offset + i}` };
    s.pending = undefined;
    s.watchlist = [];
    s.unwatched = [];
    // Lighter: the GM team just plays its lineup (no morale, inbox or market work).
    if (s.gm) {
      const gm = s.gm;
      s.aiRosters = { ...(s.aiRosters ?? {}), [gm.team]: [...gm.starters, ...gm.roster.filter((id) => !gm.starters.includes(id))] };
      s.gm = undefined;
    }
    advanceSeason(s, data);
    const table = pointsTable(s, data);
    const champs = s.events.find((e) => e.kind === "championship");
    table.forEach((r, rank) => {
      const o = acc.get(r.team);
      if (!o) return;
      o.avgPoints += r.points;
      o.avgRank += rank + 1;
      if (champs?.seeds.includes(r.team)) o.makeChamps++;
      if (champs?.placements[r.team]?.[0] === 1) o.winChamps++;
      if (s.events.some((e) => e.kind === "major" && e.placements[r.team]?.[0] === 1)) o.winMajor++;
    });
    onRun?.(i + 1);
  }
  return [...acc.values()]
    .map((o) => ({ ...o, makeChamps: o.makeChamps / runs, winChamps: o.winChamps / runs, winMajor: o.winMajor / runs, avgPoints: o.avgPoints / runs, avgRank: o.avgRank / runs }))
    .sort((a, b) => b.winChamps - a.winChamps || b.makeChamps - a.makeChamps || a.avgRank - b.avgRank);
}

// Only wire up the message handler when actually running inside a worker.
if (typeof self !== "undefined" && typeof (self as unknown as { importScripts?: unknown }).importScripts === "function") {
  const ctx = self as unknown as DedicatedWorkerGlobalScope;
  ctx.onmessage = (e: MessageEvent<SimRequest>) => {
    const req = e.data;
    if (req.kind === "heatmap") {
      try {
        for (const [m, t] of Object.entries(req.overrides)) setLayoutOverride(m, t);
        const heat = runHeatmap(req.state, req.req, (done, total) => ctx.postMessage({ id: req.id, type: "progress", next: done, total } satisfies SimResponse));
        ctx.postMessage({ id: req.id, type: "heatmap", heat } satisfies SimResponse);
      } catch (err) {
        ctx.postMessage({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) } satisfies SimResponse);
      }
      return;
    }
    if (req.kind === "odds") {
      try {
        const odds = runOdds(req.state, req.runs, (done) => ctx.postMessage({ id: req.id, type: "progress", next: done, total: req.runs } satisfies SimResponse), req.offset);
        ctx.postMessage({ id: req.id, type: "odds", odds, runs: req.runs } satisfies SimResponse);
      } catch (err) {
        ctx.postMessage({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) } satisfies SimResponse);
      }
      return;
    }
    const { id, kind, state } = req;
    try {
      const out = runSim(state, kind, (s) => ctx.postMessage({ id, type: "progress", next: s.next, total: s.steps.length } satisfies SimResponse));
      ctx.postMessage({ id, type: "done", state, ...out } satisfies SimResponse);
    } catch (err) {
      ctx.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) } satisfies SimResponse);
    }
  };
}

/** Merges odds from several batches, weighting by how many runs each did. */
export function mergeOdds(parts: { odds: TeamOdds[]; runs: number }[]): TeamOdds[] {
  const total = parts.reduce((s, p) => s + p.runs, 0);
  const acc = new Map<string, TeamOdds>();
  for (const { odds, runs } of parts) {
    for (const o of odds) {
      const a = acc.get(o.team) ?? { team: o.team, makeChamps: 0, winChamps: 0, winMajor: 0, avgPoints: 0, avgRank: 0 };
      const w = runs / total;
      a.makeChamps += o.makeChamps * w;
      a.winChamps += o.winChamps * w;
      a.winMajor += o.winMajor * w;
      a.avgPoints += o.avgPoints * w;
      a.avgRank += o.avgRank * w;
      acc.set(o.team, a);
    }
  }
  return [...acc.values()].sort((a, b) => b.winChamps - a.winChamps || b.makeChamps - a.makeChamps || a.avgRank - b.avgRank);
}
