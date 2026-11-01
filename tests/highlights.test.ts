import { describe, expect, it } from "vitest";
import { advanceSeason, commentary, createSeason, highlights, loadSeasonData, replaySeries } from "../src/engine";

describe("highlights and commentary", () => {
  const data = loadSeasonData("2026");
  const s = createSeason(data, { seed: "hl-1", ratingMode: "historical" });
  advanceSeason(s, data);
  const id = Object.keys(s.series).find((k) => k.startsWith("champs"))!;
  const maps = replaySeries(s, data, id).maps;
  const names = Array.from({ length: 8 }, (_, i) => `P${i}`);

  it("finds a handful of moments per map, in time order, each with a replay start before it", () => {
    for (const m of maps) {
      const hl = highlights(m, names, ["A", "B"]);
      expect(hl.length).toBeGreaterThan(0);
      expect(hl.length).toBeLessThanOrEqual(10);
      for (let i = 1; i < hl.length; i++) expect(hl[i]!.t).toBeGreaterThanOrEqual(hl[i - 1]!.t);
      for (const h of hl) expect(h.from).toBeLessThanOrEqual(h.t);
    }
  });

  it("commentary is deterministic and follows the clock", () => {
    const m = maps[0]!;
    const a = commentary(m, names, ["A", "B"]);
    expect(a.length).toBeGreaterThan(5);
    expect(commentary(m, names, ["A", "B"])).toEqual(a);
    for (let i = 1; i < a.length; i++) expect(a[i]!.t).toBeGreaterThanOrEqual(a[i - 1]!.t);
  });
});
