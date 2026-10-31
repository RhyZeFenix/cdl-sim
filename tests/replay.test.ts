import { describe, expect, it } from "vitest";
import { advance, createSeason, loadSeasonData, replaySeries, type MapResult } from "../src/engine";
import { layoutFor, TRACED_MAPS } from "../src/ui/replay/layouts";
import { buildTimeline, DT, hillIndex, positionAt, walkable, type Timeline } from "../src/ui/replay/timeline";

/** Every map from a couple of weeks of a season (all modes the season uses). */
function maps(year: "2025" | "2026", weeks = 1): MapResult[] {
  const data = loadSeasonData(year);
  const s = createSeason(data, { seed: `replay-${year}`, ratingMode: "historical" });
  for (let i = 0; i < weeks; i++) advance(s, data);
  return Object.keys(s.series).flatMap((id) => replaySeries(s, data, id).maps);
}

const hillCount = (m: MapResult) => Math.max(1, ...m.events.map((e) => (e.k === "hill" ? hillIndex(e.label, e.n) + 1 : 0)));
const build = (m: MapResult) => buildTimeline(m, layoutFor(m.map, hillCount(m)), `${m.map}:${m.slot}`);
const dist = (tl: Timeline, p: number, t: number, q: { x: number; y: number }) => {
  const a = positionAt(tl, p, t);
  return Math.hypot(a.x - q.x, a.y - q.y);
};

const m26 = maps("2026");
const m25 = maps("2025");
const pick = (all: MapResult[], mode: MapResult["mode"], traced = false) =>
  all.filter((m) => m.mode === mode && (!traced || TRACED_MAPS.includes(m.map)));

describe("3D replay timeline", () => {
  it("is deterministic for the same map and seed", () => {
    const m = m26[0]!;
    const a = build(m);
    const b = build(m);
    expect(a.pos).toEqual(b.pos);
    expect(a.alive).toEqual(b.alive);
  });

  it("keeps everyone on walkable ground", () => {
    for (const m of [...m26.slice(0, 6), ...pick(m25, "control").slice(0, 1)]) {
      const tl = build(m);
      for (let f = 0; f < tl.frames; f += 8)
        for (let p = 0; p < 8; p++) {
          const pt = { x: tl.pos[(f * 8 + p) * 2]!, y: tl.pos[(f * 8 + p) * 2 + 1]! };
          expect(walkable(tl.grid, pt), `${m.map} ${m.mode} p${p} at ${f * DT}s`).toBe(true);
        }
    }
  });

  it("Hardpoint: the players credited with a hold are on the hill while it counts", () => {
    let checked = 0;
    let onHill = 0;
    for (const m of pick(m26, "hp", true).slice(0, 3)) {
      const tl = build(m);
      for (const e of m.events) {
        if (e.k !== "hold" || e.secs < 8) continue;
        const hillEv = m.events.find((h) => h.k === "hill" && h.n === e.hill)!;
        const h = tl.layout.hills[hillIndex((hillEv as { label: string }).label, e.hill) % tl.layout.hills.length]!;
        for (const p of e.on) {
          checked++;
          if (dist(tl, p, e.t - 1, h) < Math.max(h.w, h.d)) onHill++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(onHill / checked).toBeGreaterThan(0.85);
  });

  it("SnD: the planter is on the site at the plant and the dead stay dead until the round ends", () => {
    let plants = 0;
    let near = 0;
    for (const m of pick(m26, "snd", true).slice(0, 3)) {
      const tl = build(m);
      let roundStart = 0;
      for (const e of m.events) {
        if (e.k === "round") roundStart = e.t;
        // The engine can log a plant at 0:00 of a round, before anyone could reach a site.
        if (e.k === "plant" && e.t - roundStart >= 8) {
          plants++;
          if (dist(tl, e.by, e.t, tl.layout.snd[e.site]) < 4) near++;
        }
      }
      // Pick a kill and check the victim is down until the next round starts.
      const kill = m.events.find((e) => e.k === "kill")!;
      const roundEnd = m.events.find((e) => e.k === "round" && e.t >= kill.t)!.t;
      for (let t = kill.t + 0.5; t < roundEnd - 0.5; t += 1) expect(positionAt(tl, (kill as { on: number }).on, t).alive).toBe(false);
    }
    expect(plants).toBeGreaterThan(5);
    expect(near / plants).toBeGreaterThan(0.85);
  });

  it("Overload: the scorer reaches the goal when the capture happens", () => {
    let caps = 0;
    let near = 0;
    for (const m of pick(m26, "overload", true).slice(0, 3)) {
      const tl = build(m);
      const half = m.events.find((e) => e.k === "half")?.t ?? Infinity;
      for (const e of m.events) {
        if (e.k !== "ocap") continue;
        caps++;
        // Spawn sides swap at the half; the scorer attacks the goal at the other end.
        const own = ((e.by < 4 ? 0 : 1) + (e.t > half ? 1 : 0)) % 2;
        if (dist(tl, e.by, e.t, tl.layout.overload.goals[1 - own]!) < 6) near++;
      }
    }
    expect(caps).toBeGreaterThan(3);
    expect(near / caps).toBeGreaterThan(0.7);
  });

  it("generic layouts cover maps without a traced one", () => {
    const l = layoutFor("Not A Real Map", 5);
    expect(l.kind).toBe("generic");
    expect(l.hills).toHaveLength(5);
    expect(layoutFor("Den", 4).kind).toBe("traced");
  });
});
