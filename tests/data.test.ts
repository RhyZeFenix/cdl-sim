import { describe, expect, it } from "vitest";
import veto from "../data/veto.json";
import season2025 from "../data/seasons/2025.json";
import {
  DataError,
  SEASON_IDS,
  loadSeasonData,
  mapPoolFor,
  parseSeason,
  parseVetoFile,
  slotToMode,
  startersOn,
  vetoProblems,
} from "../src/engine";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("bundled data", () => {
  it.each(SEASON_IDS)("season %s loads and validates", (id) => {
    const { season, rosters } = loadSeasonData(id);
    expect(season.teams).toHaveLength(12);
    expect(rosters.teams).toHaveLength(12);
    for (const t of rosters.teams) {
      for (const s of t.snapshots) expect(new Set(s.starters).size).toBe(4);
    }
  });

  it("every veto procedure covers each map slot exactly once", () => {
    const file = parseVetoFile(veto);
    const { season } = loadSeasonData("2024");
    for (const [id, proc] of Object.entries(file.procedures)) {
      expect(vetoProblems(id, proc, season.seriesFormats)).toEqual([]);
    }
  });

  it("third mode is Control in 2024/2025 and Overload in 2026", () => {
    expect(slotToMode(loadSeasonData("2024").season, "third")).toBe("control");
    expect(slotToMode(loadSeasonData("2025").season, "third")).toBe("control");
    expect(slotToMode(loadSeasonData("2026").season, "third")).toBe("overload");
  });
});

describe("map pool lookup by (season, stage, week)", () => {
  it("2025 Stage I switches from two Control maps to three at week 3", () => {
    const { season } = loadSeasonData("2025");
    expect(mapPoolFor(season, { kind: "qualifiers", stage: 1, week: 2 }).third).toEqual(["Protocol", "Vault"]);
    expect(mapPoolFor(season, { kind: "minor", stage: 1 }).hp).toContain("Hacienda");
    expect(mapPoolFor(season, { kind: "minor", stage: 1 }).third).toEqual(["Protocol", "Vault"]);
    expect(mapPoolFor(season, { kind: "qualifiers", stage: 1, week: 3 }).third).toContain("Hacienda");
  });

  it("2026 Stage IV and Champs use six-map HP/SnD and four-map Overload pools", () => {
    const { season } = loadSeasonData("2026");
    for (const phase of [{ kind: "major", stage: 4 } as const, { kind: "championship" } as const]) {
      const pool = mapPoolFor(season, phase);
      expect(pool.hp).toHaveLength(6);
      expect(pool.snd).toHaveLength(6);
      expect(pool.third).toEqual(["Den", "Exposure", "Gridlock", "Scar"]);
    }
  });

  it("2024 Major I uses the launch pool and Champs the post-Major II pool", () => {
    const { season } = loadSeasonData("2024");
    expect(mapPoolFor(season, { kind: "major", stage: 1 }).hp).toContain("Terminal");
    expect(mapPoolFor(season, { kind: "championship" }).hp).toContain("6 Star");
  });

  it("throws for phases that don't exist", () => {
    const { season } = loadSeasonData("2024");
    expect(() => mapPoolFor(season, { kind: "minor", stage: 1 })).toThrow(/no Minor/);
    expect(() => mapPoolFor(season, { kind: "qualifiers", stage: 1, week: 9 })).toThrow(/no qualifier week 9/);
  });
});

describe("stat-based ratings", () => {
  it.each(SEASON_IDS)("%s: every starter has season stats and map modifiers stay in bounds", (id) => {
    const { rosters } = loadSeasonData(id);
    for (const t of [...rosters.teams, ...rosters.guests]) {
      const starters = new Set(t.snapshots.flatMap((s) => s.starters));
      for (const p of t.players.filter((x) => starters.has(x.id))) {
        expect(p.ratingSource, `${t.team}/${p.handle}`).toBe("stats");
        expect(p.stats!.maps).toBeGreaterThan(0);
      }
      for (const v of Object.values(t.mapMods ?? {})) expect(Math.abs(v)).toBeLessThanOrEqual(0.03);
    }
    expect(rosters.ratingsNote).toMatch(/CC BY-SA/);
  });

  it("better K/D means a higher slaying rating (same season)", () => {
    const players = loadSeasonData("2025").rosters.teams.flatMap((t) => t.players).filter((p) => p.stats && p.stats.maps >= 40);
    const sorted = [...players].sort((a, b) => a.stats!.kd - b.stats!.kd);
    const lo = sorted.slice(0, 5).reduce((s, p) => s + p.ratings.slaying, 0) / 5;
    const hi = sorted.slice(-5).reduce((s, p) => s + p.ratings.slaying, 0) / 5;
    expect(hi).toBeGreaterThan(lo + 5);
  });
});

describe("rosters", () => {
  it("picks the lineup in effect on a date", () => {
    const { rosters } = loadSeasonData("2025");
    // Real OpTic 2025: Pred back for Stage 2 qualifiers, Skyz from Major II, Mercules in Stage 4.
    expect(startersOn(rosters, "optic-texas", "2025-01-01")).toContain("huke");
    expect(startersOn(rosters, "optic-texas", "2025-02-20")).toEqual(expect.arrayContaining(["pred", "kenny"]));
    expect(startersOn(rosters, "optic-texas", "2025-03-21")).toContain("skyz");
    expect(startersOn(rosters, "optic-texas", "2025-05-10")).toContain("mercules");
  });

  it("2026 Cloud9 switches lineups at Stage 2 qualifiers (they missed the 10-team Major II)", () => {
    const { rosters } = loadSeasonData("2026");
    expect(startersOn(rosters, "cloud9-new-york", "2026-01-10").sort()).toEqual(["afro", "beans", "mack", "vivid"]);
    expect(startersOn(rosters, "cloud9-new-york", "2026-02-20").sort()).toEqual(["encourage", "hide", "nejra", "okis"]);
    expect(startersOn(rosters, "cloud9-new-york", "2026-06-01")).toContain("wevy");
  });

  it("2026 Pro-Am guests have rosters", () => {
    expect(loadSeasonData("2026").rosters.guests.map((g) => g.team).sort()).toEqual([
      "huntsmen",
      "omit",
      "project-notorious",
      "roc-esports",
    ]);
  });
});

describe("validation fails loudly", () => {
  const vetoFile = parseVetoFile(veto);

  it("rejects an unknown map pool id", () => {
    const bad = clone(season2025);
    bad.stages[0]!.qualifiers.weeks[0]!.mapPool = "nope";
    expect(() => parseSeason(bad, vetoFile, "bad.json")).toThrow(/unknown map pool "nope"/);
  });

  it("rejects a duplicate map inside a pool", () => {
    const bad = clone(season2025);
    bad.mapPools[0]!.hp = ["Vault", "Vault", "Skyline"];
    expect(() => parseSeason(bad, vetoFile, "bad.json")).toThrow(DataError);
  });

  it("rejects a series format with the wrong number of maps", () => {
    const bad = clone(season2025);
    bad.seriesFormats.bo5 = ["hp", "snd", "third"];
    expect(() => parseSeason(bad, vetoFile, "bad.json")).toThrow(/bo5 must list 5 maps/);
  });

  it("rejects a veto that never picks a map slot", () => {
    const v = clone(veto);
    v.procedures["cdl-classic-bo5"].steps = v.procedures["cdl-classic-bo5"].steps.filter(
      (s: { map?: number; action: string }) => !(s.action === "pick" && s.map === 4),
    );
    expect(() => parseSeason(season2025, parseVetoFile(v), "bad.json")).toThrow(/map 4 \(hp\) is never picked/);
  });

  it("rejects a Hardpoint map with no hill rotation", () => {
    const bad = clone(season2025);
    delete (bad.hardpointHills as Record<string, unknown>)["Vault"];
    expect(() => parseSeason(bad, vetoFile, "bad.json")).toThrow(/no rotation for Hardpoint map "Vault"/);
  });

  it("rejects a rotation whose names don't match its hill count", () => {
    const bad = clone(season2025);
    (bad.hardpointHills as Record<string, { count: number }>)["Vault"]!.count = 5;
    expect(() => parseSeason(bad, vetoFile, "bad.json")).toThrow(DataError);
  });

  it("rejects a gap in a points table", () => {
    const bad = clone(season2025);
    bad.stages[0]!.major.points = bad.stages[0]!.major.points.filter((r) => r.from !== 4);
    expect(() => parseSeason(bad, vetoFile, "bad.json")).toThrow(/gap\/overlap at place 5/);
  });
});
