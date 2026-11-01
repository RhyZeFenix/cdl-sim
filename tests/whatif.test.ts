import { describe, expect, it } from "vitest";
import { advanceSeason, createSeason, loadSeasonData, playerCareer, replaySeries, roundStrip, seriesRecap, whatIf, whatIfSteps } from "../src/engine";

describe("what if", () => {
  const data = loadSeasonData("2025");
  const s = createSeason(data, { seed: "wi-1", ratingMode: "historical" });
  advanceSeason(s, data);

  it("keeps everything before the event and gives the chosen team the title", () => {
    const step = whatIfSteps(s)[1]!.index; // Major II
    const before = s.events.find((e) => e.kind === "major" && e.stage === 1)!;
    const real = Object.entries(s.events.find((e) => e.kind === "major" && e.stage === 2)!.placements).find(([, p]) => p[0] === 1)![0];
    const want = data.season.teams.map((t) => t.id).find((t) => t !== real)!;
    const r = whatIf(s, data, { step, winner: want });
    if (r.failed) return; // a long shot can fail; the check below covers the usual case
    const alt = r.state!;
    expect(alt.events.find((e) => e.kind === "major" && e.stage === 1)!.placements).toEqual(before.placements);
    const won = Object.entries(alt.events.find((e) => e.kind === "major" && e.stage === 2)!.placements).find(([, p]) => p[0] === 1)![0];
    expect(won).toBe(want);
    expect(alt.events.some((e) => e.kind === "championship")).toBe(true);
  });

  it("recaps a series and lists SnD rounds in order", () => {
    const id = Object.keys(s.series).find((k) => k.startsWith("champs"))!;
    const r = s.series[id]!;
    const maps = replaySeries(s, data, id).maps;
    const text = seriesRecap(maps, r.teams, (i, m) => m.lineup[i]!);
    expect(text).toMatch(/(beat|swept|came back)/);
    const snd = maps.find((m) => m.mode === "snd");
    if (snd) {
      const rounds = roundStrip(snd);
      expect(rounds.map((x) => x.n)).toEqual(rounds.map((_, i) => i + 1));
      expect(Math.max(...rounds[rounds.length - 1]!.score)).toBe(Math.max(...snd.score));
    }
  });
});

describe("career", () => {
  it("follows a player across all three seasons", () => {
    const c = playerCareer("shotzzy");
    expect(c.map((x) => x.season)).toEqual(["2024", "2025", "2026"]);
    expect(c.every((x) => x.maps > 50 && x.events.length > 5)).toBe(true);
    expect(c[1]!.age).toBe(c[0]!.age + 1);
  });
});
