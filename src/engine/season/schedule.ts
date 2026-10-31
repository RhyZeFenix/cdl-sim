// Qualifier schedules: a seeded round robin (circle method), cut to the stage's
// matches-per-team and spread across its weeks. Every team plays exactly k matches
// with no repeat opponents.
import type { Stage } from "../data/schema";
import type { Rng } from "../rng";

export interface Fixture {
  id: string;
  stage: number;
  week: number;
  teams: [string, string];
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Circle-method rounds: n-1 rounds of n/2 pairs; every pair meets exactly once. */
export function roundRobinRounds(teams: string[]): [string, string][][] {
  if (teams.length % 2 !== 0) throw new Error("round robin needs an even number of teams");
  const n = teams.length;
  const arr = [...teams];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([arr[i]!, arr[n - 1 - i]!]);
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

/** Fixtures for one stage, grouped by week (index 0 = week 1). */
export function buildQualifierSchedule(stage: Stage, teams: string[], rng: Rng): Fixture[][] {
  const k = stage.qualifiers.matchesPerTeam;
  const weeks = stage.qualifiers.weeks.length;
  if (k > teams.length - 1) throw new Error(`stage ${stage.stage}: ${k} matches each is more than a full round robin`);
  const rounds = shuffle(roundRobinRounds(shuffle(teams, rng)), rng).slice(0, k);
  const byWeek: Fixture[][] = Array.from({ length: weeks }, () => []);
  rounds.forEach((pairs, r) => {
    const week = Math.min(weeks, Math.floor((r * weeks) / k) + 1);
    pairs.forEach((p, i) => {
      const teamsOrdered: [string, string] = rng.chance(0.5) ? p : [p[1], p[0]];
      byWeek[week - 1]!.push({ id: `s${stage.stage}-w${week}-r${r + 1}-m${i + 1}`, stage: stage.stage, week, teams: teamsOrdered });
    });
  });
  return byWeek;
}
