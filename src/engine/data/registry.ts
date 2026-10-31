// Single entry point for bundled data. Everything is validated on first access and
// cached; any bad file throws a DataError naming the file and every problem in it.
import vetoRaw from "../../../data/veto.json";
import season2024 from "../../../data/seasons/2024.json";
import season2025 from "../../../data/seasons/2025.json";
import season2026 from "../../../data/seasons/2026.json";
import rosters2024 from "../../../data/rosters/2024.json";
import rosters2025 from "../../../data/rosters/2025.json";
import rosters2026 from "../../../data/rosters/2026.json";
import { DataError, parseRosterFile, parseSeason, parseVetoFile, rosterProblems } from "./load";
import type { RosterFile, Season, VetoProcedure } from "./schema";

export type SeasonId = "2024" | "2025" | "2026";
export const SEASON_IDS: readonly SeasonId[] = ["2024", "2025", "2026"];

const RAW: Record<SeasonId, { season: unknown; rosters: unknown }> = {
  "2024": { season: season2024, rosters: rosters2024 },
  "2025": { season: season2025, rosters: rosters2025 },
  "2026": { season: season2026, rosters: rosters2026 },
};

export interface SeasonData {
  season: Season;
  rosters: RosterFile;
  veto: { bo5: VetoProcedure; bo7: VetoProcedure; bo9: VetoProcedure };
}

const cache = new Map<SeasonId, SeasonData>();

export function loadSeasonData(id: SeasonId): SeasonData {
  const hit = cache.get(id);
  if (hit) return hit;
  const vetoFile = parseVetoFile(vetoRaw);
  const season = parseSeason(RAW[id].season, vetoFile, `data/seasons/${id}.json`);
  const rosters = parseRosterFile(RAW[id].rosters, `data/rosters/${id}.json`);
  const problems = rosterProblems(season, rosters);
  if (problems.length) throw new DataError(`data/rosters/${id}.json`, problems);
  const data: SeasonData = {
    season,
    rosters,
    veto: {
      bo5: vetoFile.procedures[season.veto.bo5]!,
      bo7: vetoFile.procedures[season.veto.bo7]!,
      bo9: vetoFile.procedures[season.veto.bo9]!,
    },
  };
  cache.set(id, data);
  return data;
}

/** The lineup a team fields on a given date (latest snapshot effective on or before it). */
export function startersOn(rosters: RosterFile, teamId: string, date: string): string[] {
  const team = [...rosters.teams, ...rosters.guests].find((t) => t.team === teamId);
  if (!team) throw new Error(`no roster for ${teamId}`);
  const snap = [...team.snapshots].reverse().find((s) => s.effective <= date) ?? team.snapshots[0]!;
  return snap.starters;
}
