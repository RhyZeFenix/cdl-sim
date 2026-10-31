// Parses raw JSON into typed data and runs the cross-file checks zod can't express
// on its own (pool ids exist, veto covers every map slot, roster teams match).
import { z } from "zod";
import {
  RosterFile,
  Season,
  VetoFile,
  type BestOf,
  type LanEvent,
  type SeriesFormats,
  type VetoProcedure,
} from "./schema";

export class DataError extends Error {
  constructor(file: string, problems: string[]) {
    super(`Invalid data in ${file}:\n  - ${problems.join("\n  - ")}`);
    this.name = "DataError";
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown, file: string): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new DataError(
      file,
      r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return r.data;
}

export function parseVetoFile(raw: unknown, file = "data/veto.json"): VetoFile {
  return parse(VetoFile, raw, file);
}

export function parseRosterFile(raw: unknown, file: string): RosterFile {
  return parse(RosterFile, raw, file);
}

/** Checks that a procedure assigns every map slot of its format exactly once, with the right mode. */
export function vetoProblems(id: string, proc: VetoProcedure, formats: SeriesFormats): string[] {
  const order = formats[`bo${proc.bestOf}` as `bo${BestOf}`];
  const problems: string[] = [];
  const assigned = new Map<number, string>();
  for (const step of proc.steps) {
    if (step.action === "ban" || step.action === "side") {
      if (step.action === "side" && (step.map < 1 || step.map > order.length)) {
        problems.push(`${id}: side step for map ${step.map} outside Bo${proc.bestOf}`);
      }
      continue;
    }
    const slot = order[step.map - 1];
    if (!slot) {
      problems.push(`${id}: ${step.action} for map ${step.map} outside Bo${proc.bestOf}`);
      continue;
    }
    if (slot !== step.mode) problems.push(`${id}: map ${step.map} is ${slot} but step picks ${step.mode}`);
    if (assigned.has(step.map)) problems.push(`${id}: map ${step.map} assigned twice`);
    assigned.set(step.map, step.mode);
  }
  for (let m = 1; m <= order.length; m++) {
    if (!assigned.has(m)) problems.push(`${id}: map ${m} (${order[m - 1]}) is never picked`);
  }
  return problems;
}

function eventProblems(label: string, ev: LanEvent, poolIds: Set<string>, teamIds: Set<string>): string[] {
  const p: string[] = [];
  if (!poolIds.has(ev.mapPool)) p.push(`${label}: unknown map pool "${ev.mapPool}"`);
  if (ev.start > ev.end) p.push(`${label}: starts after it ends`);
  if (ev.host && !teamIds.has(ev.host)) p.push(`${label}: unknown host "${ev.host}"`);
  if (ev.realResult) {
    for (const t of [ev.realResult.winner, ev.realResult.runnerUp]) {
      if (!teamIds.has(t)) p.push(`${label}: unknown team "${t}" in realResult`);
    }
  }
  const sorted = [...ev.points].sort((a, b) => a.from - b.from);
  sorted.forEach((row, i) => {
    if (row.to < row.from) p.push(`${label}: points row ${row.from}-${row.to} is reversed`);
    const prev = sorted[i - 1];
    if (prev && row.from !== prev.to + 1) p.push(`${label}: points table gap/overlap at place ${row.from}`);
  });
  return p;
}

export function parseSeason(raw: unknown, veto: VetoFile, file: string): Season {
  const s = parse(Season, raw, file);
  const problems: string[] = [];
  const poolIds = new Set(s.mapPools.map((p) => p.id));
  const teamIds = new Set(s.teams.map((t) => t.id));

  if (poolIds.size !== s.mapPools.length) problems.push("duplicate map pool id");
  if (teamIds.size !== s.teams.length) problems.push("duplicate team id");

  const usesThird = s.thirdMode;
  if (!s.modeSettings[usesThird]) problems.push(`modeSettings.${usesThird} missing for third mode`);

  for (const key of ["bo5", "bo7", "bo9"] as const) {
    const id = s.veto[key];
    const proc = veto.procedures[id];
    if (!proc) {
      problems.push(`veto.${key}: unknown procedure "${id}"`);
      continue;
    }
    if (`bo${proc.bestOf}` !== key) problems.push(`veto.${key}: procedure "${id}" is Bo${proc.bestOf}`);
    problems.push(...vetoProblems(id, proc, s.seriesFormats));
  }

  let prevEnd = "";
  s.stages.forEach((st, i) => {
    const label = `stage ${st.stage}`;
    if (st.stage !== i + 1) problems.push(`stages[${i}] should be stage ${i + 1}`);
    const q = st.qualifiers;
    if (q.start > q.end) problems.push(`${label} qualifiers: starts after it ends`);
    if (prevEnd && q.start <= prevEnd) problems.push(`${label} qualifiers start before the previous stage ends`);
    q.weeks.forEach((w, wi) => {
      if (w.week !== wi + 1) problems.push(`${label} week list out of order at index ${wi}`);
      if (!poolIds.has(w.mapPool)) problems.push(`${label} week ${w.week}: unknown map pool "${w.mapPool}"`);
    });
    if (st.minor) problems.push(...eventProblems(`${label} minor`, st.minor, poolIds, teamIds));
    problems.push(...eventProblems(`${label} major`, st.major, poolIds, teamIds));
    if (st.major.start < q.end) problems.push(`${label} major starts before qualifiers end`);
    prevEnd = st.major.end;
  });
  problems.push(...eventProblems("championship", s.championship, poolIds, teamIds));

  for (const t of Object.keys(s.historical?.finalPoints ?? {})) {
    if (!teamIds.has(t)) problems.push(`historical.finalPoints: unknown team "${t}"`);
  }

  if (problems.length) throw new DataError(file, problems);
  return s;
}

/** Roster teams must match the season's teams one-to-one. */
export function rosterProblems(season: Season, rosters: RosterFile): string[] {
  const p: string[] = [];
  const want = new Set(season.teams.map((t) => t.id));
  const have = new Set(rosters.teams.map((t) => t.team));
  for (const t of want) if (!have.has(t)) p.push(`missing roster for ${t}`);
  for (const t of have) if (!want.has(t)) p.push(`roster for unknown team ${t}`);
  return p;
}
