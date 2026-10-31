import { describe, expect, it } from "vitest";
import {
  advance,
  advanceSeason,
  aiRoster,
  aiTrade,
  capOf,
  chemistryOf,
  createRng,
  createSeason,
  evaluateTrade,
  gmSetAutoVeto,
  gmSetSpoilerFree,
  gmSetStarters,
  loadSeasonData,
  ovrOf,
  roleBalance,
  seasonReview,
  startNextSeason,
  visibleAchievements,
  teamLineup,
  nextStepDate,
  type Difficulty,
  type SeasonState,
} from "../src/engine";
import { runOdds } from "../src/ui/simWorker";
import { readShare } from "../src/ui/share";
import { headToHead, seasonRecords, teamProfile } from "../src/ui/stats";
import { compact } from "../src/ui/saves";

const data = loadSeasonData("2026");
const GM = "optic-texas";

function season(seed: string, difficulty?: Difficulty): SeasonState {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM, difficulty });
  gmSetAutoVeto(s, true);
  gmSetSpoilerFree(s, false);
  return s;
}

describe("GM mode, part 3", () => {
  it("difficulty changes the cap and how hard AI teams bargain", () => {
    expect(capOf(season("d1", "easy"))).toBeGreaterThan(capOf(season("d1", "normal")));
    expect(capOf(season("d1", "hard"))).toBeLessThan(capOf(season("d1", "normal")));
    expect(Number.isFinite(capOf(season("d1", "sandbox")))).toBe(false);
    // The same offer: easier to get done on easy than on hard.
    const easy = season("d2", "easy");
    const hard = season("d2", "hard");
    const other = data.season.teams.find((t) => t.id !== GM)!.id;
    const theirs = aiRoster(easy, data, other);
    const mine = easy.gm!.roster.slice().sort((a, b) => ovrOf(easy, data, a) - ovrOf(easy, data, b));
    const offers = theirs.map((id) => ({ team: other, give: [mine[0]!], get: [id] }));
    const yesEasy = offers.filter((o) => evaluateTrade(easy, data, o).accepted).length;
    const yesHard = offers.filter((o) => evaluateTrade(hard, data, o).accepted).length;
    expect(yesEasy).toBeGreaterThanOrEqual(yesHard);
  });

  it("chemistry starts with real teammates, grows with maps, and drops with a new face", () => {
    const s = season("ch1");
    const start = chemistryOf(s, s.gm!.starters);
    expect(start).toBeGreaterThan(0);
    advance(s, data);
    expect(chemistryOf(s, s.gm!.starters)).toBeGreaterThan(start);
    const swapped = [...s.gm!.starters.slice(0, 3), "someone-new"];
    expect(chemistryOf(s, swapped)).toBeLessThan(chemistryOf(s, s.gm!.starters));
  });

  it("role balance flags a lineup without an SMG player", () => {
    const s = season("rb1");
    const ids = Object.values(Object.fromEntries(data.rosters.teams.flatMap((t) => t.players).filter((p) => p.role === "AR").slice(0, 4).map((p) => [p.id, p.id])));
    const rb = roleBalance(s, data, ids);
    expect(rb.ok).toBe(false);
    expect(rb.note).toMatch(/SMG/);
    expect(roleBalance(s, data, s.gm!.starters).ar + roleBalance(s, data, s.gm!.starters).smg + roleBalance(s, data, s.gm!.starters).flex).toBe(4);
    void gmSetStarters;
  });

  it("AI teams can trade with each other without anyone ending up on two teams", () => {
    const s = season("ai1");
    let done = false;
    for (let i = 0; i < 10 && !done; i++) done = aiTrade(s, data, createRng(`t${i}`));
    expect(done).toBe(true);
    const all = data.season.teams.filter((t) => t.id !== GM).flatMap((t) => teamLineup(s, data, t.id, nextStepDate(s, data))).concat(s.gm!.starters).filter((id) => !id.startsWith("repl-"));
    expect(new Set(all).size).toBe(all.length);
  });

  it("achievements unlock, the season review fills in, and the career carries over", () => {
    const s = season("ac3");
    s.gm!.trust = 90;
    advanceSeason(s, data);
    const got = visibleAchievements(s, new Set());
    expect(got.some((a) => a.id === "first-win")).toBe(true);
    const r = seasonReview(s, data);
    expect(r.recap.record[0] + r.recap.record[1]).toBeGreaterThan(5);
    expect(r.finishes.length).toBeGreaterThan(0);
    const next = startNextSeason(s, data);
    expect(next.gm!.achievements!.length).toBe(s.gm!.achievements!.length + (next.gm!.achievements!.some((a) => a.id === "dynasty") ? 1 : 0));
    expect(next.dynasty!.history[0]!.signings).toBeDefined();
  });
});

describe("website helpers", () => {
  it("share links round-trip the settings", () => {
    const spec = readShare("#s=2025&seed=abc123&gm=optic-texas&d=hard&chaos=1");
    expect(spec?.config).toMatchObject({ seasonId: "2025", seed: "abc123", gmTeam: "optic-texas", difficulty: "hard", chaos: true, champsOnly: false });
    expect(readShare("#s=1999&seed=x")).toBeNull();
    expect(readShare("#s=2026&seed=x&step=7")?.step).toBe(7);
  });

  it("odds: probabilities add up and played results stay put", () => {
    const s = createSeason(data, { seed: "odds", ratingMode: "historical" });
    advance(s, data);
    const before = JSON.stringify(s.series);
    const odds = runOdds(s, 4);
    expect(JSON.stringify(s.series)).toBe(before);
    const total = odds.reduce((t, o) => t + o.winChamps, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(odds.every((o) => o.makeChamps >= o.winChamps)).toBe(true);
  });

  it("records, head-to-head and team pages read the season (and skip hidden results)", () => {
    const s = createSeason(data, { seed: "rec", ratingMode: "historical" });
    for (let i = 0; i < 6; i++) advance(s, data);
    const r = seasonRecords(s, data, new Set());
    expect(r.bestMaps.length).toBe(10);
    const any = Object.values(s.series)[0]!;
    expect(headToHead(s, any.teams[0], any.teams[1], new Set()).length).toBeGreaterThan(0);
    expect(headToHead(s, any.teams[0], any.teams[1], new Set([any.id])).some((x) => x.id === any.id)).toBe(false);
    const p = teamProfile(s, data, any.teams[0], new Set());
    expect(p.series.length).toBeGreaterThan(0);
    expect(p.byMap.reduce((t, m) => t + m.w + m.l, 0)).toBe(p.maps[0] + p.maps[1]);
  });

  it("compacted saves drop event logs but keep everything else", () => {
    const s = season("cmp");
    advance(s, data);
    const c = compact(s);
    expect(Object.values(c.series).every((r) => r.maps.every((m) => m.events === undefined))).toBe(true);
    expect(Object.keys(c.series)).toEqual(Object.keys(s.series));
    expect(c.gm!.morale).toEqual(s.gm!.morale);
  });
});
