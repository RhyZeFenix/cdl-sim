import { describe, expect, it } from "vitest";
import { loadSeasonData, playerForm, type SeriesLine } from "../src/engine";
import { mapFactors } from "../src/engine/data/mapstats";
import { layoutFor, setLayoutOverride, tracedLayout } from "../src/ui/replay/layouts";
import { buildingWalls, heightAt } from "../src/ui/replay/shapes";
import { buildGrid, holdSpots, los, walkable } from "../src/ui/replay/timeline";
import { mergeOdds } from "../src/ui/simWorker";

describe("map geometry", () => {
  it("buildings get walls with real gaps for doors and low walls for windows", () => {
    const walls = buildingWalls({ r: [10, 10, 30, 20], h: 4, doors: [{ side: "s", at: 0.5, w: 4 }], windows: [{ side: "n", at: 0.5, w: 4 }] });
    // South wall split around a 4-wide door at x 18-22.
    const south = walls.filter((w) => w.r[1] > 19 && !w.window);
    expect(south.some((w) => w.r[2] <= 18.01)).toBe(true);
    expect(south.some((w) => w.r[0] >= 21.99)).toBe(true);
    expect(walls.filter((w) => w.window)).toHaveLength(1);
    // Walk in through the door: the inside is open ground.
    const L = { ...layoutFor("Nowhere", 1), floor: [[0, 0, 100, 100]] as [number, number, number, number][], blocks: [], buildings: [{ r: [10, 10, 30, 20] as [number, number, number, number], h: 4, doors: [{ side: "s" as const, at: 0.5, w: 4 }] }] };
    const g = buildGrid(L);
    expect(walkable(g, { x: 20, y: 15 })).toBe(true);
    expect(walkable(g, { x: 20, y: 19.7 })).toBe(true); // the doorway
    expect(walkable(g, { x: 12, y: 19.7 })).toBe(false); // the wall
  });

  it("raised floors lift players, and Rewind's store has doors", () => {
    const den = layoutFor("Den", 4);
    expect(heightAt(den, 63, 35)).toBeGreaterThan(0);
    expect(heightAt(den, 20, 50)).toBe(0);
    expect(layoutFor("Rewind", 5).buildings?.[0]?.doors?.length).toBe(4);
  });

  it("hold spots sit next to cover with sight of the objective", () => {
    const L = layoutFor("Scar", 5);
    const g = buildGrid(L);
    const hill = L.hills[0]!;
    const spots = holdSpots(g, hill, 6, 15);
    expect(spots.length).toBeGreaterThan(5);
    for (const p of spots.slice(0, 20)) {
      expect(walkable(g, p)).toBe(true);
      expect(los(g, p, hill)).toBe(true);
    }
  });

  it("editor overrides replace the traced layout until cleared", () => {
    const base = tracedLayout("Den")!;
    setLayoutOverride("Den", { ...base, callouts: [{ x: 50, y: 50, text: "Test" }] });
    expect(layoutFor("Den", 4).kind).toBe("edited");
    expect(layoutFor("Den", 4).callouts?.[0]?.text).toBe("Test");
    setLayoutOverride("Den", null);
    expect(layoutFor("Den", 4).kind).toBe("traced");
  });
});

describe("map factors from real data", () => {
  it("every season has pace and closeness per map, near 1 and shrunk for small samples", () => {
    for (const y of ["2024", "2025", "2026"] as const) {
      const f = loadSeasonData(y).season.mapFactors!;
      const vals = Object.values(f);
      expect(vals.length).toBeGreaterThan(10);
      for (const v of vals) {
        expect(v.pace).toBeGreaterThan(0.6);
        expect(v.pace).toBeLessThan(1.4);
      }
    }
    // A map with one game barely moves from 1.
    const tiny = mapFactors([
      { Map: "A", Gamemode: "Hardpoint", Win: "1", Rows: "4", Kills: "200", HPTime: "300", OVRCaps: "", SDKills: "", ConCaptures: "" },
      { Map: "A", Gamemode: "Hardpoint", Win: "0", Rows: "4", Kills: "100", HPTime: "100", OVRCaps: "", SDKills: "", ConCaptures: "" },
      { Map: "B", Gamemode: "Hardpoint", Win: "1", Rows: "400", Kills: "10000", HPTime: "30000", OVRCaps: "", SDKills: "", ConCaptures: "" },
      { Map: "B", Gamemode: "Hardpoint", Win: "0", Rows: "400", Kills: "9000", HPTime: "22000", OVRCaps: "", SDKills: "", ConCaptures: "" },
    ]);
    expect(Math.abs(tiny["hp:A"]!.pace - 1)).toBeLessThan(0.05);
  });
});

describe("player form and odds", () => {
  it("form flags a player running hot", () => {
    const s = (k: number, d: number): SeriesLine => ({ id: "x", date: "", label: "", team: "t", opponent: "o", won: true, maps: 3, kills: k, deaths: d });
    const series = [s(80, 50), s(75, 50), s(80, 50), s(78, 50), s(82, 50), s(50, 60), s(48, 60), s(50, 60), s(52, 60)];
    const f = playerForm(series)!;
    expect(f.label).toBe("hot");
    expect(f.trend).toHaveLength(9);
    expect(playerForm(series.slice(0, 4))).toBeUndefined();
  });

  it("odds from several workers merge by weight", () => {
    const o = (team: string, win: number) => ({ team, makeChamps: 1, winChamps: win, winMajor: win, avgPoints: 100, avgRank: 1 });
    const m = mergeOdds([
      { odds: [o("a", 1), o("b", 0)], runs: 30 },
      { odds: [o("a", 0), o("b", 1)], runs: 10 },
    ]);
    expect(m.find((x) => x.team === "a")!.winChamps).toBeCloseTo(0.75, 5);
    expect(m.find((x) => x.team === "b")!.winChamps).toBeCloseTo(0.25, 5);
  });
});
