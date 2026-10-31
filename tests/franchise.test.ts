import { describe, expect, it } from "vitest";
import {
  advance,
  advanceSeason,
  createSeason,
  evaluateTrade,
  freeAgents,
  gmMarkWatched,
  gmSetAutoVeto,
  gmSetPrep,
  gmSetSpoilerFree,
  gmSign,
  loadSeasonData,
  mapPoolFor,
  nextGmFixtures,
  nextStepDate,
  payroll,
  proposeTrade,
  replaySeries,
  scoutReport,
  seasonLabel,
  shownMorale,
  startNextSeason,
  teamLineup,
  visibleInbox,
  aiRoster,
  ovrOf,
  SALARY_CAP,
  MIN_EXCEPTION,
  contractFor,
  type SeasonData,
  type SeasonState,
} from "../src/engine";

const d26 = loadSeasonData("2026");
const GM = "optic-texas";

function gmSeason(data: SeasonData, team: string, seed: string): SeasonState {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: team });
  gmSetAutoVeto(s, true);
  return s;
}

const gmSeries = (s: SeasonState) => Object.values(s.series).filter((r) => r.teams.includes(s.gm!.team));

describe("weekly loop", () => {
  it("a new GM season has contracts, morale, owner goals and a welcome note", () => {
    const s = gmSeason(d26, GM, "fr-init");
    const gm = s.gm!;
    expect(Object.keys(gm.contracts!).sort()).toEqual([...gm.roster].sort());
    expect(Object.values(gm.morale!).every((m) => m === 70)).toBe(true);
    expect(gm.goals!.length).toBeGreaterThan(0);
    expect(gm.inbox![0]!.kind).toBe("welcome");
    expect(gm.expectedRank).toBeGreaterThan(0);
  });

  it("the scouting report covers the next opponent and every pool map", () => {
    const s = gmSeason(d26, GM, "fr-scout");
    const [fx] = nextGmFixtures(s, d26);
    expect(fx).toBeDefined();
    const r = scoutReport(s, d26, fx!.opponent, fx!.phase, new Set());
    const pool = mapPoolFor(d26.season, fx!.phase);
    expect(r.maps).toHaveLength(pool.hp.length + pool.snd.length + pool.third.length);
    expect(r.lineup).toHaveLength(4);
    expect(r.maps.filter((m) => m.likely === "pick")).toHaveLength(3);
  });

  it("prep boosts the chosen map, is stored on the series, and replays identically", () => {
    const s = gmSeason(d26, GM, "fr-prep");
    const [fx] = nextGmFixtures(s, d26);
    const map = mapPoolFor(d26.season, fx!.phase).hp[0]!;
    gmSetPrep(s, { kind: "map", mode: "hp", map });
    advance(s, d26);
    const rec = gmSeries(s)[0]!;
    expect(rec.gmBoost?.prep).toEqual({ [`hp:${map}`]: 0.04 });
    const again = replaySeries(s, d26, rec.id);
    expect(again.maps.map((m) => m.score)).toEqual(rec.maps.map((m) => m.score));
  });

  it("morale and recaps from an unwatched match stay hidden until it is watched", () => {
    const s = gmSeason(d26, GM, "fr-hidden");
    advance(s, d26);
    const unwatched = new Set(s.gm!.unwatched);
    expect(unwatched.size).toBeGreaterThan(0);
    // While hidden, morale shows as it was before the week.
    const shown = shownMorale(s, unwatched);
    expect(Object.values(shown).every((m) => m === 70)).toBe(true);
    expect(Object.values(s.gm!.morale!).some((m) => m !== 70)).toBe(true);
    expect(visibleInbox(s, unwatched).some((i) => i.kind === "recap")).toBe(false);
    for (const id of [...unwatched]) gmMarkWatched(s, id);
    expect(shownMorale(s, new Set())).toEqual(s.gm!.morale);
    expect(visibleInbox(s, new Set()).some((i) => i.kind === "recap")).toBe(true);
  });
});

describe("contracts and trades", () => {
  it("signings respect the cap, with a minimum-salary exception", () => {
    const s = gmSeason(d26, GM, "fr-cap");
    s.gm!.deadCap = SALARY_CAP; // no room at all
    const fas = freeAgents(s, d26).sort((a, b) => ovrOf(s, d26, b) - ovrOf(s, d26, a));
    expect(() => gmSign(s, d26, fas[0]!, 2)).toThrow(/cap space/);
    const cheap = fas.reverse().find((id) => contractFor(s, d26, id, 1).salary <= MIN_EXCEPTION)!;
    expect(cheap).toBeDefined();
    gmSign(s, d26, cheap, 1);
    expect(s.gm!.roster).toContain(cheap);
    expect(s.gm!.contracts![cheap]!.years).toBe(1);
  });

  it("an AI team takes a trade it wins, and the players switch lineups", () => {
    const s = gmSeason(d26, GM, "fr-trade");
    const gm = s.gm!;
    const other = d26.season.teams.find((t) => t.id !== GM)!.id;
    const theirs = aiRoster(s, d26, other);
    const worst = theirs.slice().sort((a, b) => ovrOf(s, d26, a) - ovrOf(s, d26, b))[0]!;
    const mine = gm.roster.slice().sort((a, b) => ovrOf(s, d26, b) - ovrOf(s, d26, a))[0]!;
    // Lopsided in their favour: accepted.
    expect(evaluateTrade(s, d26, { team: other, give: [mine], get: [worst] }).accepted).toBe(true);
    // Their best player for nothing: refused.
    const best = theirs.slice().sort((a, b) => ovrOf(s, d26, b) - ovrOf(s, d26, a))[0]!;
    expect(evaluateTrade(s, d26, { team: other, give: [], get: [best] }).accepted).toBe(false);

    proposeTrade(s, d26, { team: other, give: [mine], get: [worst] });
    expect(gm.roster).toContain(worst);
    expect(gm.roster).not.toContain(mine);
    expect(gm.contracts![worst]).toBeDefined();
    const date = nextStepDate(s, d26);
    expect(teamLineup(s, d26, other, date)).toContain(mine);
    // Nobody plays for two teams.
    const all = d26.season.teams.flatMap((t) => teamLineup(s, d26, t.id, date)).filter((id) => !id.startsWith("repl-"));
    expect(new Set(all).size).toBe(all.length);
    expect(payroll(s)).toBeGreaterThan(0);
  });
});

describe("owner goals and dynasty", () => {
  it("a full season ends with an owner review", () => {
    const s = gmSeason(d26, GM, "fr-owner");
    gmSetSpoilerFree(s, false);
    advanceSeason(s, d26);
    const review = s.gm!.inbox!.find((i) => i.title === "End-of-season review");
    expect(review).toBeDefined();
    expect(s.gm!.trust).toBeGreaterThanOrEqual(0);
  });

  it("dynasty: 2024 carries into 2025 with contracts ticking down", () => {
    const d24 = loadSeasonData("2024");
    const s = gmSeason(d24, "seattle-surge", "fr-dyn");
    gmSetSpoilerFree(s, false);
    s.gm!.trust = 90; // never fired in this test
    advanceSeason(s, d24);
    const before = s.gm!;
    const staying = before.roster.filter((id) => before.contracts![id]!.years > 1);
    const expiring = before.roster.find((id) => before.contracts![id]!.years <= 1);
    const next = startNextSeason(s, d24, { resign: expiring ? { [expiring]: 2 } : {} });
    expect(next.seasonId).toBe("2025");
    expect(next.gm!.team).toBe("vancouver-surge");
    expect(next.dynasty!.year).toBe(2);
    expect(next.dynasty!.history).toHaveLength(1);
    for (const id of staying) {
      expect(next.gm!.roster).toContain(id);
      expect(next.gm!.contracts![id]!.years).toBe(before.contracts![id]!.years - 1);
    }
    if (expiring) expect(next.gm!.contracts![expiring]!.years).toBe(2);
    // The new season plays without anyone on two teams.
    const d25 = loadSeasonData("2025");
    gmSetAutoVeto(next, true);
    advance(next, d25);
    const date = nextStepDate(next, d25);
    const all = d25.season.teams.flatMap((t) => teamLineup(next, d25, t.id, date)).filter((id) => !id.startsWith("repl-"));
    expect(new Set(all).size).toBe(all.length);
  });

  it("dynasty past 2026 repeats the format with progressed ratings", () => {
    const s = gmSeason(d26, GM, "fr-2027");
    gmSetSpoilerFree(s, false);
    s.gm!.trust = 90;
    advanceSeason(s, d26);
    const next = startNextSeason(s, d26);
    expect(next.seasonId).toBe("2026");
    expect(seasonLabel(next, d26)).toBe("CDL 2027");
    expect(Object.keys(next.ratingAdj!).length).toBeGreaterThan(20);
    gmSetAutoVeto(next, true);
    advance(next, d26);
    expect(next.next).toBe(1);
  });
});
