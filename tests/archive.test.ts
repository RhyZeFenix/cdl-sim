import { describe, expect, it } from "vitest";
import { advanceSeason, createSeason, loadSeasonData } from "../src/engine";
import { archiveMeta, hallOfFame } from "../src/ui/saves";

describe("season archive and Hall of Fame", () => {
  it("summarizes a finished season and totals titles across saves", () => {
    const data = loadSeasonData("2025");
    const metas = ["arc-1", "arc-2"].map((seed) => {
      const s = createSeason(data, { seed, ratingMode: "historical" });
      advanceSeason(s, data);
      return archiveMeta(s);
    });
    for (const m of metas) {
      expect(m.champion).toBeDefined();
      expect(m.mvp?.handle).toBeTruthy();
      expect(m.events.length).toBeGreaterThan(4);
    }
    const h = hallOfFame(metas);
    expect(h.teams.reduce((n, t) => n + t.champs, 0)).toBe(2);
    expect(h.mvps.reduce((n, m) => n + m.count, 0)).toBe(2);
    expect(h.careers).toEqual([]);
  });
});
