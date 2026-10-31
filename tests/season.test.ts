import { describe, expect, it } from "vitest";
import {
  advance,
  advanceSeason,
  bracketPlan,
  buildQualifierSchedule,
  createRng,
  createSeason,
  isDone,
  loadSeasonData,
  rankStandings,
  replaySeries,
  runBracket,
  seasonSteps,
  type BracketFormat,
  type BracketPlan,
  type SeasonState,
} from "../src/engine";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

/** Plays a bracket where the better seed always wins (or randomly with a seed). */
function play(plan: BracketPlan, seeds: string[], mode: "chalk" | "random" = "chalk") {
  const rng = createRng("bracket");
  const losses = new Map<string, number>();
  const run = runBracket(plan, seeds, (def, teams) => {
    const aWins = mode === "chalk" ? true : rng.chance(0.5);
    const need = (def.bestOf + 1) / 2;
    const score: [number, number] = aWins ? [need, rng.int(0, need - 1)] : [rng.int(0, need - 1), need];
    const loser = aWins ? teams[1] : teams[0];
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
    return { seriesId: def.id, score };
  });
  return { run, losses };
}

const DE12: BracketFormat = { type: "double-elim", winnersSeeds: [1, 2, 3, 4, 5, 6, 7, 8], losersSeeds: [9, 10, 11, 12] };

function placementCounts(p: Record<string, [number, number]>) {
  const c = new Map<string, number>();
  for (const [f, t] of Object.values(p)) c.set(`${f}-${t}`, (c.get(`${f}-${t}`) ?? 0) + 1);
  return Object.fromEntries(c);
}

describe("qualifier schedule", () => {
  it.each([5, 7, 11])("%i matches each: exact count, no repeat opponents, spread over weeks", (k) => {
    const { season } = loadSeasonData("2026");
    const stage = { ...season.stages[0]!, qualifiers: { ...season.stages[0]!.qualifiers, matchesPerTeam: k } };
    const weeks = buildQualifierSchedule(stage, ids(12), createRng(`sched${k}`));
    const all = weeks.flat();
    expect(all).toHaveLength((12 * k) / 2);
    const count = new Map<string, number>();
    const pairs = new Set<string>();
    for (const f of all) {
      for (const t of f.teams) count.set(t, (count.get(t) ?? 0) + 1);
      const key = [...f.teams].sort().join("|");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
    for (const t of ids(12)) expect(count.get(t)).toBe(k);
    expect(weeks.every((w) => w.length > 0)).toBe(true);
  });
});

describe("tiebreakers", () => {
  // t1, t2, t3 all 2-1; t1 beat t2, t2 beat t3, t3 beat t1 (h2h circular), t4 0-3.
  const results = [
    { teams: ["t1", "t2"] as [string, string], score: [3, 2] as [number, number] },
    { teams: ["t2", "t3"] as [string, string], score: [3, 0] as [number, number] },
    { teams: ["t3", "t1"] as [string, string], score: [3, 1] as [number, number] },
    { teams: ["t1", "t4"] as [string, string], score: [3, 0] as [number, number] },
    { teams: ["t2", "t4"] as [string, string], score: [3, 2] as [number, number] },
    { teams: ["t3", "t4"] as [string, string], score: [3, 0] as [number, number] },
  ];
  // Map diffs: t1 7-5 (+2), t2 8-6 (+2), t3 6-4 (+2) ... adjust: compute below.

  it("2025 order: series wins, then map differential", () => {
    const rows = rankStandings(ids(4), results, ["seriesWins", "mapDiff", "h2hSeries", "seriesWinPct", "mapsLost"], createRng("x"));
    expect(rows.map((r) => r.team).at(-1)).toBe("t4");
    const top = rows.slice(0, 3);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.mapDiff).toBeGreaterThanOrEqual(top[i]!.mapDiff);
  });

  it("the season's tiebreaker order decides between h2h and map diff", () => {
    // t1 and t2 both 2-1. t1 beat t2 head-to-head; t2 has the better map diff (+5 vs +1).
    const r = [
      { teams: ["t1", "t2"] as [string, string], score: [3, 2] as [number, number] },
      { teams: ["t2", "t3"] as [string, string], score: [3, 0] as [number, number] },
      { teams: ["t3", "t1"] as [string, string], score: [3, 2] as [number, number] },
      { teams: ["t2", "t4"] as [string, string], score: [3, 0] as [number, number] },
      { teams: ["t1", "t4"] as [string, string], score: [3, 2] as [number, number] },
    ];
    const order2026 = rankStandings(ids(4), r, ["seriesWins", "seriesWinPct", "h2hSeries", "mapDiff"], createRng("x"));
    expect(order2026.slice(0, 2).map((x) => x.team)).toEqual(["t1", "t2"]);
    const order2025 = rankStandings(ids(4), r, ["seriesWins", "mapDiff", "h2hSeries", "seriesWinPct", "mapsLost"], createRng("x"));
    expect(order2025.slice(0, 2).map((x) => x.team)).toEqual(["t2", "t1"]);
  });

  it("head-to-head only counts games among the teams still tied", () => {
    // Three-way tie at 1-1 in a cycle: h2h is 1-1 for everyone, so map diff decides.
    const r = [
      { teams: ["t1", "t2"] as [string, string], score: [3, 0] as [number, number] },
      { teams: ["t2", "t3"] as [string, string], score: [3, 2] as [number, number] },
      { teams: ["t3", "t1"] as [string, string], score: [3, 1] as [number, number] },
    ];
    const rows = rankStandings(["t1", "t2", "t3"], r, ["seriesWins", "h2hSeries", "mapDiff"], createRng("x"));
    expect(rows.map((x) => x.team)).toEqual(["t1", "t3", "t2"]);
  });

  it("falls back to a deterministic seeded coin", () => {
    const a = rankStandings(ids(4), [], ["seriesWins"], createRng("coin"));
    const b = rankStandings(ids(4), [], ["seriesWins"], createRng("coin"));
    expect(a.map((r) => r.team)).toEqual(b.map((r) => r.team));
  });
});

describe("brackets", () => {
  it("12-team double elimination: 18 series, placements match the points table", () => {
    const plan = bracketPlan(DE12, 5, 7);
    const { run } = play(plan, ids(12));
    expect(run.matches).toHaveLength(18);
    expect(placementCounts(run.placements)).toEqual({ "1-1": 1, "2-2": 1, "3-3": 1, "4-4": 1, "5-6": 2, "7-8": 2, "9-12": 4 });
    expect(run.placements.t1).toEqual([1, 1]);
    expect(run.placements.t2).toEqual([2, 2]);
    expect(run.matches.at(-1)!.def.bestOf).toBe(7);
  });

  it("12-team Major Losers R1 pairs like the real 2024-2025 Majors", () => {
    // Chalk: the higher seed wins every Winners R1 match, so the losers are seeds 8, 5, 7, 6.
    const { run } = play(bracketPlan(DE12, 5, 7), ids(12));
    const lr1 = run.matches.filter((m) => m.def.id.startsWith("L1")).map((m) => [...m.teams].sort().join(" v "));
    expect(lr1).toEqual(["t8 v t9", "t12 v t5", "t10 v t7", "t11 v t6"]);
  });

  it("double elimination: nobody plays after their second loss; LB entrants are out after one", () => {
    for (let i = 0; i < 30; i++) {
      const plan = bracketPlan(DE12, 5, 7);
      const rng = createRng(`de${i}`);
      const losses = new Map<string, number>();
      const run = runBracket(plan, ids(12), (def, teams) => {
        for (const t of teams) {
          const limit = ["t9", "t10", "t11", "t12"].includes(t) ? 1 : 2;
          expect(losses.get(t) ?? 0).toBeLessThan(limit);
        }
        const a = rng.chance(0.5);
        losses.set(a ? teams[1] : teams[0], (losses.get(a ? teams[1] : teams[0]) ?? 0) + 1);
        return { seriesId: def.id, score: a ? [3, 1] : [1, 3] };
      });
      expect(Object.keys(run.placements)).toHaveLength(12);
    }
  });

  it("8-team Champs bracket with a Bo9 final", () => {
    const plan = bracketPlan({ type: "double-elim", winnersSeeds: [1, 2, 3, 4, 5, 6, 7, 8], losersSeeds: [] }, 5, 9);
    const { run } = play(plan, ids(8), "random");
    expect(run.matches).toHaveLength(14);
    expect(placementCounts(run.placements)).toEqual({ "1-1": 1, "2-2": 1, "3-3": 1, "4-4": 1, "5-6": 2, "7-8": 2 });
    expect(run.matches.at(-1)!.def.bestOf).toBe(9);
  });

  it("Minor: 12-team single elimination, seeds 1-4 start in the quarterfinals", () => {
    const plan = bracketPlan({ type: "single-elim", size: 12, byes: 4 }, 5, 7);
    const { run } = play(plan, ids(12), "random");
    expect(run.matches).toHaveLength(11);
    const r1Teams = run.matches.filter((m) => m.def.round === 1).flatMap((m) => m.teams);
    for (const t of ["t1", "t2", "t3", "t4"]) expect(r1Teams).not.toContain(t);
    expect(placementCounts(run.placements)).toEqual({ "1-1": 1, "2-2": 1, "3-4": 2, "5-8": 4, "9-12": 4 });
  });

  it("2026 Major II play-in: seeds 11-12 out, 7-10 play in for two spots", () => {
    const { season } = loadSeasonData("2026");
    const plan = bracketPlan(season.stages[1]!.major.format, 5, 7);
    const { run } = play(plan, ids(12), "random");
    expect(run.matches).toHaveLength(16);
    const played = new Set(run.matches.flatMap((m) => m.teams));
    expect(played.has("t11") || played.has("t12")).toBe(false);
    expect(run.placements.t11).toEqual([11, 12]);
    const pi = run.matches.filter((m) => m.def.section === "playin").flatMap((m) => m.teams).sort();
    expect(pi).toEqual(["t10", "t7", "t8", "t9"]);
  });

  it("2026 Pro-Am: four GSL groups feed an 8-team double elimination", () => {
    const { season } = loadSeasonData("2026");
    const plan = bracketPlan(season.stages[2]!.major.format, 5, 7);
    const { run } = play(plan, ids(16), "random");
    expect(run.matches).toHaveLength(4 * 5 + 14);
    expect(placementCounts(run.placements)).toEqual({ "1-1": 1, "2-2": 1, "3-3": 1, "4-4": 1, "5-6": 2, "7-8": 2, "9-12": 4, "13-16": 4 });
    const chalk = play(plan, ids(16)).run;
    expect(chalk.placements.t1).toEqual([1, 1]);
  });
});

describe("season pipeline", () => {
  it("places each Minor in the right week", () => {
    const at = (id: "2025" | "2026", stage: number) => {
      const steps = seasonSteps(loadSeasonData(id).season).filter((s) => "stage" in s && s.stage === stage);
      const i = steps.findIndex((s) => s.kind === "minor");
      return steps.slice(0, i).filter((s) => s.kind === "week").length;
    };
    expect(at("2025", 1)).toBe(2);
    expect(at("2025", 2)).toBe(2);
    expect(at("2026", 3)).toBe(1);
    expect(at("2026", 4)).toBe(1);
    expect(seasonSteps(loadSeasonData("2024").season).some((s) => s.kind === "minor")).toBe(false);
  });

  const full: Record<string, SeasonState> = {};
  const runFull = (id: "2024" | "2025" | "2026", seed = "test") => {
    const key = `${id}/${seed}`;
    if (!full[key]) {
      const data = loadSeasonData(id);
      const s = createSeason(data, { seed, ratingMode: "historical" });
      advanceSeason(s, data);
      full[key] = s;
    }
    return full[key]!;
  };

  it.each(["2024", "2025", "2026"] as const)("%s: points = 10 per qualifier win + placement points", (id) => {
    const data = loadSeasonData(id);
    const s = runFull(id);
    expect(isDone(s)).toBe(true);
    for (const t of data.season.teams) {
      const qualWins = s.qualifiers.flat().filter((sid) => s.series[sid]!.winner === t.id).length;
      const eventPts = s.events.reduce((n, e) => n + (e.points[t.id] ?? 0), 0);
      expect(s.points[t.id]).toBe(qualWins * 10 + eventPts);
    }
    for (const e of s.events) {
      const ev = e.kind === "championship" ? data.season.championship : data.season.stages[e.stage! - 1]![e.kind]!;
      for (const [team, [from]] of Object.entries(e.placements)) {
        if (!data.season.teams.some((x) => x.id === team)) continue;
        expect(e.points[team]).toBe(ev.points.find((r) => from >= r.from && from <= r.to)!.points);
      }
    }
  });

  it("Champs seeds are the top 8 in CDL points", () => {
    const data = loadSeasonData("2026");
    const s = runFull("2026");
    const champs = s.events.find((e) => e.kind === "championship")!;
    const before = s.pointsHistory.at(-2)!.points;
    const sorted = Object.entries(before).sort((a, b) => b[1] - a[1]);
    const cut = sorted[7]![1];
    for (const t of champs.seeds) expect(before[t]).toBeGreaterThanOrEqual(cut);
    expect(champs.seeds).toHaveLength(8);
    expect(data.season.teams.length).toBe(12);
  });

  it("is deterministic and replays any series exactly", () => {
    const data = loadSeasonData("2025");
    const a = runFull("2025", "same");
    const s2 = createSeason(data, { seed: "same", ratingMode: "historical" });
    advanceSeason(s2, data);
    expect(JSON.stringify(s2)).toBe(JSON.stringify(a));

    const qual = a.series[a.qualifiers[1]![0]!]!;
    expect(qual.hasEvents).toBe(false);
    const re = replaySeries(a, data, qual.id);
    expect(re.score).toEqual(qual.score);
    re.maps.forEach((m, i) => expect(m.box).toEqual(qual.maps[i]!.box));
    expect(re.maps[0]!.events.length).toBeGreaterThan(0);
  });

  it("save/load mid-season continues identically", () => {
    const data = loadSeasonData("2026");
    const uninterrupted = runFull("2026", "resume");
    const s = createSeason(data, { seed: "resume", ratingMode: "historical" });
    for (let i = 0; i < 9; i++) advance(s, data);
    const loaded: SeasonState = JSON.parse(JSON.stringify(s));
    advanceSeason(loaded, data);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(uninterrupted));
  });

  it.each(["2024", "2025", "2026"] as const)("%s Champs-only mode uses the real seeds", (id) => {
    const data = loadSeasonData(id);
    const s = createSeason(data, { seed: "champs", ratingMode: "historical", champsOnly: true });
    expect(s.steps).toEqual([{ kind: "championship" }]);
    advanceSeason(s, data);
    expect(isDone(s)).toBe(true);
    const champs = s.events[0]!;
    expect(champs.kind).toBe("championship");
    expect(champs.seeds).toEqual(data.season.historical!.champsSeeds);
    expect(champs.matches).toHaveLength(14);
    expect(Object.keys(s.series)).toHaveLength(14);
  });

  it("Champs-only 2026 starts from the real final points", () => {
    const data = loadSeasonData("2026");
    const s = createSeason(data, { seed: "champs", ratingMode: "historical", champsOnly: true });
    expect(s.points["optic-texas"]).toBe(575);
    expect(s.points["cloud9-new-york"]).toBe(30);
  });

  it("Chaos changes results but stays deterministic per seed", () => {
    const data = loadSeasonData("2026");
    const run = (chaos: boolean) => {
      const s = createSeason(data, { seed: "chaos", ratingMode: "historical", chaos });
      advanceSeason(s, data);
      return JSON.stringify(s.series);
    };
    expect(run(true)).toBe(run(true));
    expect(run(true)).not.toBe(run(false));
  });

  it("a full season simulates in under 5 seconds", () => {
    const data = loadSeasonData("2026");
    const t0 = performance.now();
    const s = createSeason(data, { seed: "speed", ratingMode: "randomized" });
    advanceSeason(s, data);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
