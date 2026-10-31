import { describe, expect, it } from "vitest";
import {
  boxScore,
  buildSimTeam,
  createRng,
  loadSeasonData,
  mapLog,
  mapPoolFor,
  runVeto,
  scoreFromEvents,
  simulateMap,
  simulateSeries,
  aiChooser,
  type Chooser,
  type PoolPhase,
  type SeasonId,
  type SeriesResult,
} from "../src/engine";

function series(seasonId: SeasonId, a: string, b: string, bestOf: 5 | 7 | 9, phase: PoolPhase, seed: string) {
  const data = loadSeasonData(seasonId);
  const date = data.season.championship.start;
  const teams = [buildSimTeam(data, a, date), buildSimTeam(data, b, date)] as const;
  return simulateSeries({
    teams: [teams[0], teams[1]],
    bestOf,
    season: data.season,
    veto: data.veto,
    pool: mapPoolFor(data.season, phase),
    rng: createRng(seed),
  });
}

const champs: PoolPhase = { kind: "championship" };
const SEEDS = Array.from({ length: 40 }, (_, i) => `s${i}`);

function checkMapScores(r: SeriesResult) {
  for (const m of r.maps) {
    const [hi, lo] = m.score[0] > m.score[1] ? [m.score[0], m.score[1]] : [m.score[1], m.score[0]];
    switch (m.mode) {
      case "hp":
        expect(hi).toBe(250);
        expect(lo).toBeLessThan(250);
        expect(lo).toBeGreaterThanOrEqual(0);
        break;
      case "snd":
        expect(hi).toBe(6);
        expect(lo).toBeLessThanOrEqual(5);
        expect(m.events.filter((e) => e.k === "round").length).toBeLessThanOrEqual(11);
        break;
      case "control":
        expect(hi).toBe(3);
        expect(lo).toBeLessThanOrEqual(2);
        break;
      case "overload":
        expect(hi).toBeGreaterThan(lo);
        expect(hi).toBeLessThanOrEqual(8);
        break;
    }
  }
}

describe("rng", () => {
  it("is deterministic per seed and forks independently of draw order", () => {
    const a = createRng("x");
    const b = createRng("x");
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
    const c = createRng("x");
    c.next();
    expect(c.fork("child").next()).toBe(createRng("x").fork("child").next());
    expect(createRng("y").next()).not.toBe(createRng("x").next());
  });
});

describe("series clinching", () => {
  it.each([5, 7, 9] as const)("Bo%i stops as soon as a team clinches", (bo) => {
    const need = (bo + 1) / 2;
    for (const seed of SEEDS) {
      const r = series("2026", "optic-texas", "faze-vegas", bo, champs, seed);
      expect(Math.max(...r.score)).toBe(need);
      expect(Math.min(...r.score)).toBeLessThan(need);
      expect(r.maps).toHaveLength(r.score[0] + r.score[1]);
      expect(r.maps[r.maps.length - 1]!.winner).toBe(r.winner);
      expect(r.score[r.winner]).toBe(need);
    }
  });

  it("plays maps in the season's mode order", () => {
    const { season } = loadSeasonData("2025");
    const r = series("2025", "optic-texas", "vancouver-surge", 9, champs, "order");
    const order = season.seriesFormats.bo9.map((s) => (s === "third" ? "control" : s));
    expect(r.veto.maps.map((m) => m.mode)).toEqual(order);
    r.maps.forEach((m, i) => expect(m.mode).toBe(order[i]));
  });
});

describe("veto", () => {
  it.each(["2024", "2025", "2026"] as const)("%s: no repeats, picks come from the pool, banned maps never played", (sid) => {
    const data = loadSeasonData(sid);
    for (const bo of [5, 7, 9] as const) {
      for (const seed of SEEDS.slice(0, 10)) {
        const a = data.season.teams[0]!.id;
        const b = data.season.teams[1]!.id;
        const r = series(sid, a, b, bo, champs, seed + bo);
        const pool = mapPoolFor(data.season, champs);
        const keys = r.veto.maps.map((m) => `${m.mode}:${m.map}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const m of r.veto.maps) {
          const list = m.mode === "hp" ? pool.hp : m.mode === "snd" ? pool.snd : pool.third;
          expect(list).toContain(m.map);
        }
        const banned = r.veto.records.filter((x) => x.action === "ban").map((x) => `${x.mode}:${x.map}`);
        for (const k of banned) expect(keys).not.toContain(k);
      }
    }
  });

  it("follows the procedure's step order (team A bans HP first, team B bans SnD first)", () => {
    const r = series("2026", "optic-texas", "faze-vegas", 5, champs, "order");
    const A = r.veto.teamA;
    const recs = r.veto.records.filter((x) => x.action !== "side");
    expect(recs[0]).toMatchObject({ action: "ban", team: A, mode: "hp" });
    expect(recs[1]).toMatchObject({ action: "ban", team: 1 - A, mode: "hp" });
    expect(recs[2]).toMatchObject({ action: "pick", team: A, mode: "hp", slot: 1 });
    expect(recs[3]).toMatchObject({ action: "pick", team: 1 - A, mode: "hp", slot: 4 });
    expect(recs[4]).toMatchObject({ action: "ban", team: 1 - A, mode: "snd" });
    expect(recs[6]).toMatchObject({ action: "pick", team: 1 - A, mode: "snd", slot: 2 });
  });

  it("2025 two-map Control pool: one ban, remaining map is played", () => {
    const data = loadSeasonData("2025");
    const r = series("2025", "optic-texas", "atlanta-faze", 5, { kind: "qualifiers", stage: 1, week: 1 }, "ctl");
    const third = r.veto.records.filter((x) => "mode" in x && x.mode === "control");
    expect(third.map((x) => x.action)).toEqual(["ban", "skip-ban", "remaining"]);
    expect(data.season.mapPools[0]!.third).toContain(r.veto.maps[2]!.map);
  });

  it("Bo9 with a five-map SnD pool skips the second SnD ban", () => {
    const r = series("2025", "optic-texas", "atlanta-faze", 9, champs, "bo9");
    const snd = r.veto.records.filter((x) => "mode" in x && x.mode === "snd").map((x) => x.action);
    expect(snd.filter((a) => a === "ban")).toHaveLength(1);
    expect(snd).toContain("skip-ban");
    expect(r.veto.maps.filter((m) => m.mode === "snd")).toHaveLength(4);
  });

  it("GM chooser decisions are applied, and invalid choices are rejected", () => {
    const data = loadSeasonData("2026");
    const date = data.season.championship.start;
    const teams = [buildSimTeam(data, "optic-texas", date), buildSimTeam(data, "faze-vegas", date)] as [any, any];
    const pool = mapPoolFor(data.season, champs);
    const ai = aiChooser(teams, 1, createRng("ai"));
    const user: Chooser = (req) => (req.action === "pick" && req.mode === "hp" ? req.options.includes("Den") ? "Den" : req.options[0]! : req.options[0]!);
    const r = runVeto({ proc: data.veto.bo5, season: data.season, pool, teamA: 0, choosers: [user, ai] });
    expect(r.maps[0]!.map).toBe("Den");
    expect(() =>
      runVeto({ proc: data.veto.bo5, season: data.season, pool, teamA: 0, choosers: [() => "Nuketown", ai] }),
    ).toThrow(/invalid veto choice/);
  });
});

describe("map simulation", () => {
  it.each(["2024", "2025", "2026"] as const)("%s: every mode produces valid scores", (sid) => {
    const data = loadSeasonData(sid);
    for (const seed of SEEDS) {
      const [a, b] = [data.season.teams[2]!.id, data.season.teams[5]!.id];
      checkMapScores(series(sid, a, b, 9, champs, seed));
    }
  });

  it("scores and box scores are derived from events and reconcile", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const r = series("2026", "optic-texas", "la-thieves", 9, champs, seed);
      for (const m of r.maps) {
        expect(scoreFromEvents(m.mode, m.events)).toEqual(m.score);
        expect(boxScore(m.events)).toEqual(m.box);
        const kills = (s: 0 | 1) => m.box.slice(s * 4, s * 4 + 4).reduce((x, l) => x + l.kills, 0);
        const deaths = (s: 0 | 1) => m.box.slice(s * 4, s * 4 + 4).reduce((x, l) => x + l.deaths, 0);
        expect(kills(0)).toBe(deaths(1));
        expect(kills(1)).toBe(deaths(0));
        if (m.mode === "hp") {
          for (const s of [0, 1] as const) {
            expect(m.box.slice(s * 4, s * 4 + 4).reduce((x, l) => x + l.hillTime, 0)).toBe(m.score[s]);
          }
        }
        if (m.mode === "overload") {
          for (const s of [0, 1] as const) {
            expect(m.box.slice(s * 4, s * 4 + 4).reduce((x, l) => x + l.oCaps, 0)).toBe(m.score[s]);
          }
        }
        if (m.mode === "snd") {
          const fbs = m.box.reduce((x, l) => x + l.firstBloods, 0);
          expect(fbs).toBe(m.events.filter((e) => e.k === "round").length);
        }
      }
    }
  });

  it("is deterministic: same seed, identical series", () => {
    const a = series("2026", "optic-texas", "faze-vegas", 9, champs, "same");
    const b = series("2026", "optic-texas", "faze-vegas", 9, champs, "same");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = series("2026", "optic-texas", "faze-vegas", 9, champs, "different");
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it("Hardpoint plays the map's real hill rotation", () => {
    const data = loadSeasonData("2026");
    const date = data.season.championship.start;
    const teams = [buildSimTeam(data, "optic-texas", date), buildSimTeam(data, "faze-vegas", date)] as [any, any];
    const m = simulateMap({ teams, season: data.season, vm: { slot: 1, mode: "hp", map: "Den" }, rng: createRng("hills") });
    const labels = m.events.filter((e) => e.k === "hill").map((e) => (e as { label: string }).label);
    const den = ["P1 Courtyard", "P2 Balcony", "P3 Helipad", "P4 Terrace"];
    labels.forEach((l, i) => expect(l).toBe(den[i % 4]));
    const g = simulateMap({ teams, season: data.season, vm: { slot: 1, mode: "hp", map: "Gridlock" }, rng: createRng("hills") });
    const gl = g.events.filter((e) => e.k === "hill").map((e) => (e as { label: string }).label);
    expect(new Set(gl)).toEqual(new Set(["P1", "P2", "P3", "P4"]));
  });

  it("renders a play-by-play line per hill / round", () => {
    const r = series("2026", "optic-texas", "faze-vegas", 9, champs, "pbp");
    for (const m of r.maps) {
      const lines = mapLog(m, { team: ["OTX", "FAZE"], player: m.lineup });
      if (m.mode === "hp") expect(lines.length).toBe(m.events.filter((e) => e.k === "hill").length);
      if (m.mode === "snd") expect(lines.length).toBe(m.events.filter((e) => e.k === "round").length);
      expect(lines.length).toBeGreaterThan(0);
    }
  });
});
