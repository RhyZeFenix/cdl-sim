// Standings and tiebreakers. Ties are broken key by key; head-to-head is computed only
// among the teams still tied at that point, as CDL rules do. A seeded coin flip is
// the last resort so results stay deterministic.
import type { Tiebreaker } from "../data/schema";
import type { Rng } from "../rng";

/** The minimum a standings calculation needs from a played series. */
export interface SeriesOutcome {
  teams: [string, string];
  /** Maps won by each side. */
  score: [number, number];
}

export interface StandingRow {
  team: string;
  seriesW: number;
  seriesL: number;
  mapW: number;
  mapL: number;
  mapDiff: number;
}

export function tally(teams: string[], results: SeriesOutcome[]): Map<string, StandingRow> {
  const rows = new Map(teams.map((t) => [t, { team: t, seriesW: 0, seriesL: 0, mapW: 0, mapL: 0, mapDiff: 0 }]));
  for (const r of results) {
    const [a, b] = r.teams;
    const ra = rows.get(a);
    const rb = rows.get(b);
    if (!ra || !rb) continue;
    const aWon = r.score[0] > r.score[1];
    (aWon ? ra : rb).seriesW++;
    (aWon ? rb : ra).seriesL++;
    ra.mapW += r.score[0];
    ra.mapL += r.score[1];
    rb.mapW += r.score[1];
    rb.mapL += r.score[0];
  }
  for (const row of rows.values()) row.mapDiff = row.mapW - row.mapL;
  return rows;
}

/** A ranking key: higher value ranks first. Gets the currently tied group. */
export type RankKey = (group: string[]) => Map<string, number>;

export function tiebreakerKey(tb: Tiebreaker, rows: Map<string, StandingRow>, results: SeriesOutcome[]): RankKey {
  const per = (f: (r: StandingRow) => number): RankKey => (group) => new Map(group.map((t) => [t, f(rows.get(t)!)]));
  switch (tb) {
    case "seriesWins": return per((r) => r.seriesW);
    case "seriesWinPct": return per((r) => (r.seriesW + r.seriesL ? r.seriesW / (r.seriesW + r.seriesL) : 0));
    case "mapDiff": return per((r) => r.mapDiff);
    case "mapsLost": return per((r) => -r.mapL);
    case "h2hSeries":
      return (group) => {
        const inGroup = new Set(group);
        const wins = new Map(group.map((t) => [t, 0]));
        for (const r of results) {
          if (!inGroup.has(r.teams[0]) || !inGroup.has(r.teams[1])) continue;
          const w = r.score[0] > r.score[1] ? r.teams[0] : r.teams[1];
          wins.set(w, wins.get(w)! + 1);
        }
        return wins;
      };
  }
}

/** Orders teams by keys applied in turn to each tied group; seeded coin flip last. */
export function rankBy(teams: string[], keys: RankKey[], rng: Rng): string[] {
  const resolve = (group: string[], k: number): string[] => {
    if (group.length <= 1) return group;
    const key = keys[k];
    if (!key) {
      const coin = rng.fork([...group].sort().join(","));
      return [...group].sort().map((t) => ({ t, r: coin.next() })).sort((a, b) => a.r - b.r).map((x) => x.t);
    }
    const vals = key(group);
    const levels = [...new Set(group.map((t) => vals.get(t)!))].sort((a, b) => b - a);
    return levels.flatMap((v) => resolve(group.filter((t) => vals.get(t) === v), k + 1));
  };
  return resolve(teams, 0);
}

/** Qualifier standings for a set of results, using the season's tiebreaker order. */
export function rankStandings(
  teams: string[],
  results: SeriesOutcome[],
  tiebreakers: Tiebreaker[],
  rng: Rng,
): StandingRow[] {
  const rows = tally(teams, results);
  const order = rankBy(teams, tiebreakers.map((tb) => tiebreakerKey(tb, rows, results)), rng);
  return order.map((t) => rows.get(t)!);
}

/**
 * CDL points table order. Points first, then season series wins and map differential
 * (official points tiebreak not found; see season `unverified`).
 */
export function rankByPoints(
  teams: string[],
  points: Record<string, number>,
  seasonResults: SeriesOutcome[],
  rng: Rng,
): string[] {
  const rows = tally(teams, seasonResults);
  const pointsKey: RankKey = (g) => new Map(g.map((t) => [t, points[t] ?? 0]));
  return rankBy(teams, [pointsKey, tiebreakerKey("seriesWins", rows, seasonResults), tiebreakerKey("mapDiff", rows, seasonResults)], rng);
}
