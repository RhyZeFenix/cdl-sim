// Owner goals: set before the season from how strong the roster is next to the rest
// of the league, tracked through the season, and judged at the end. Owner trust
// (0-100) moves with each event against expectations and decides the verdict.
import type { SeasonData } from "../data/registry";
import { isDone, pointsTable, teamLineup, type SeasonState } from "../season/season";
import { ovrOf } from "./contracts";
import { difficultyOf } from "./difficulty";
import type { OwnerGoal, OwnerVerdict } from "./types";

/** Teams that make Champs. */
export function champsSize(data: SeasonData): number {
  const f = data.season.championship.format;
  return f.type === "double-elim" ? f.winnersSeeds.length + f.losersSeeds.length : 8;
}

/** Average overall of each team's starters at the start of the next step, strongest first. */
export function strengthRanking(state: SeasonState, data: SeasonData, date: string): { team: string; ovr: number }[] {
  return data.season.teams
    .map((t) => {
      const ids = teamLineup(state, data, t.id, date);
      return { team: t.id, ovr: ids.reduce((s, id) => s + ovrOf(state, data, id), 0) / ids.length };
    })
    .sort((a, b) => b.ovr - a.ovr);
}

export function goalsFor(rank: number, data: SeasonData): OwnerGoal[] {
  const n = data.season.teams.length;
  const champs = champsSize(data);
  if (rank <= 2) return [{ kind: "winEvent", event: "major" }, { kind: "pointsRank", max: 3 }, { kind: "champsTop", max: 4 }];
  if (rank <= 4) return [{ kind: "pointsRank", max: 4 }, { kind: "eventTop", max: 4 }, { kind: "champsTop", max: 6 }];
  if (rank <= Math.min(8, champs)) return [{ kind: "makeChamps" }, { kind: "eventTop", max: 6 }];
  return [{ kind: "pointsRank", max: Math.min(n - 2, champs + 2) }, { kind: "eventTop", max: 8 }];
}

export function goalText(g: OwnerGoal): string {
  switch (g.kind) {
    case "pointsRank":
      return `Finish top ${g.max} in CDL points`;
    case "makeChamps":
      return "Qualify for Champs";
    case "winEvent":
      return g.event === "major" ? "Win a Major" : "Win an event";
    case "eventTop":
      return `Finish top ${g.max} at a Major`;
    case "champsTop":
      return `Finish top ${g.max} at Champs`;
  }
}

export type GoalStatus = "met" | "failed" | "on track" | "at risk" | "open";

/** Where a goal stands now. Uses every result, so the UI only shows it when nothing is hidden. */
export function goalStatus(state: SeasonState, data: SeasonData, g: OwnerGoal): { status: GoalStatus; detail: string } {
  const team = state.gm!.team;
  const done = isDone(state);
  const rank = pointsTable(state, data).findIndex((r) => r.team === team) + 1;
  const majors = state.events.filter((e) => e.kind === "major");
  const champs = state.events.find((e) => e.kind === "championship");
  const allMajors = majors.length === data.season.stages.length;
  const place = (e: (typeof majors)[number]) => e.placements[team]?.[0];
  const best = majors.map(place).filter((p): p is number => p !== undefined).sort((a, b) => a - b)[0];
  // Before any results every team is level, so a points rank means nothing yet.
  if ((g.kind === "pointsRank" || g.kind === "makeChamps") && !Object.keys(state.series).length) {
    return { status: "open", detail: "No results yet" };
  }
  switch (g.kind) {
    case "pointsRank":
      if (done || champs) return { status: rank <= g.max ? "met" : "failed", detail: `Finished ${ordinal(rank)}` };
      return { status: rank <= g.max ? "on track" : "at risk", detail: `${ordinal(rank)} now` };
    case "makeChamps":
      if (champs) return { status: champs.seeds.includes(team) ? "met" : "failed", detail: champs.seeds.includes(team) ? `Seed ${champs.seeds.indexOf(team) + 1}` : "Missed out" };
      return { status: rank <= champsSize(data) ? "on track" : "at risk", detail: `${ordinal(rank)} in points (top ${champsSize(data)} qualify)` };
    case "winEvent": {
      const pool = g.event === "major" ? majors : state.events;
      if (pool.some((e) => place(e) === 1)) return { status: "met", detail: `Won ${pool.find((e) => place(e) === 1)!.name}` };
      const over = g.event === "major" ? allMajors : done;
      return { status: over ? "failed" : "open", detail: best ? `Best Major finish: ${ordinal(best)}` : "No Major played yet" };
    }
    case "eventTop":
      if (best !== undefined && best <= g.max) return { status: "met", detail: `${ordinal(best)} at a Major` };
      return { status: allMajors ? "failed" : "open", detail: best ? `Best so far: ${ordinal(best)}` : "No Major played yet" };
    case "champsTop": {
      if (!champs) return { status: "open", detail: "Champs not played yet" };
      const p = champs.placements[team]?.[0];
      if (p === undefined) return { status: "failed", detail: "Didn't make Champs" };
      return { status: p <= g.max ? "met" : "failed", detail: `${ordinal(p)} at Champs` };
    }
  }
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** The owner's end-of-season verdict (or the verdict if the season ended now). */
export function ownerVerdict(state: SeasonState, data: SeasonData): { met: number; total: number; verdict: OwnerVerdict } {
  const goals = state.gm?.goals ?? [];
  const met = goals.filter((g) => goalStatus(state, data, g).status === "met").length;
  const trust = state.gm?.trust ?? 60;
  let verdict: OwnerVerdict;
  if (goals.length && met === goals.length) verdict = "extended";
  else if (met * 2 >= goals.length) verdict = "satisfied";
  else if (trust < difficultyOf(state).fireBelow) verdict = "fired";
  else verdict = "on notice";
  return { met, total: goals.length, verdict };
}

export const verdictText: Record<OwnerVerdict, string> = {
  extended: "Delighted — your contract is extended.",
  satisfied: "Satisfied — you're back next season.",
  "on notice": "Disappointed — you're on notice for next season.",
  fired: "You're fired.",
};
