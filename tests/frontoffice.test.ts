import { describe, expect, it } from "vitest";
import {
  ACADEMY_MAX,
  SCRIM_EDGE,
  STAFF_BUDGET,
  advance,
  advanceSeason,
  calendar,
  coachFactor,
  contractFor,
  createSeason,
  gmBoostFor,
  gmChoose,
  gmHire,
  gmPromoteProspect,
  gmSetAutoVeto,
  gmSetPrep,
  gmSetScrims,
  gmSetSpoilerFree,
  gmSetStarters,
  gmSignProspect,
  loadSeasonData,
  marketWindow,
  mapPoolFor,
  nextGmFixtures,
  nextStepDate,
  overall,
  scoutReport,
  staffPool,
  startNextSeason,
  teamLineup,
  tradesOpen,
  type SeasonState,
} from "../src/engine";

const data = loadSeasonData("2026");
const GM = "boston-breach";

function season(seed: string): SeasonState {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM });
  gmSetAutoVeto(s, true);
  gmSetSpoilerFree(s, false);
  return s;
}

describe("staff", () => {
  it("a better coach scales prep; the budget caps who you can hire", () => {
    const s = season("st-1");
    const before = coachFactor(s);
    const best = staffPool(s).find((m) => m.role === "coach" && m.rating === 5)!;
    gmHire(s, best.id);
    expect(coachFactor(s)).toBeGreaterThan(before);
    const [fx] = nextGmFixtures(s, data);
    const map = mapPoolFor(data.season, fx!.phase).hp[0]!;
    gmSetPrep(s, { kind: "map", mode: "hp", map });
    expect(gmBoostFor(s, data, fx!.phase).prep![`hp:${map}`]).toBeCloseTo(0.04 * 1.3, 4);
    // A five-star analyst on top blows the budget.
    const analyst = staffPool(s).find((m) => m.role === "analyst" && m.rating === 5)!;
    if (best.salary + analyst.salary > STAFF_BUDGET) expect(() => gmHire(s, analyst.id)).toThrow(/budget/);
  });

  it("an analyst turns basic scouting into full reads", () => {
    const s = season("st-2");
    const [fx] = nextGmFixtures(s, data);
    expect(scoutReport(s, data, fx!.opponent, fx!.phase, new Set()).intel).toBe("basic");
    gmHire(s, staffPool(s).find((m) => m.role === "analyst" && m.rating === 3)!.id);
    expect(scoutReport(s, data, fx!.opponent, fx!.phase, new Set()).intel).toBe("full");
  });
});

describe("practice planner", () => {
  it("scrims build fatigue and an edge against that team", () => {
    const s = season("pr-1");
    const partner = data.season.teams.find((t) => t.id !== GM)!.id;
    gmSetScrims(s, data, [partner]);
    advance(s, data);
    expect(s.gm!.fatigue).toBeGreaterThan(0);
    expect(s.gm!.familiarity![partner]).toBe(s.next + 2);
    const phase = { kind: "qualifiers", stage: 1, week: 2 } as const;
    const vs = gmBoostFor(s, data, phase, partner).form ?? 0;
    const other = gmBoostFor(s, data, phase, data.season.teams.find((t) => t.id !== GM && t.id !== partner)!.id).form ?? 0;
    expect(vs - other).toBeCloseTo(SCRIM_EDGE, 5);
  });
});

describe("AI market", () => {
  it("an underpaid player asks for a raise, and paying it updates the contract", () => {
    const s = season("mk-1");
    const id = s.gm!.roster[0]!;
    s.gm!.contracts![id] = { salary: 10, years: 2 };
    s.gm!.inbox = [];
    marketWindow(s, data);
    const item = s.gm!.inbox!.find((i) => i.action?.type === "raise" && i.action.player === id)!;
    expect(item).toBeDefined();
    gmChoose(s, data, item.id, "pay");
    expect(s.gm!.contracts![id]!.salary).toBeGreaterThan(10);
    expect(() => gmChoose(s, data, item.id, "pay")).toThrow(/Already/);
  });

  it("AI teams fill holes from free agency, and accepted offers make the trade", () => {
    const s = season("mk-2");
    const team = data.season.teams.find((t) => t.id !== GM)!.id;
    s.aiRosters = { [team]: teamLineup(s, data, team, nextStepDate(s, data)).slice(0, 3) };
    s.gm!.inbox = [];
    marketWindow(s, data);
    expect(teamLineup(s, data, team, nextStepDate(s, data)).some((id) => id.startsWith("repl-"))).toBe(false);
    const offer = s.gm!.inbox!.find((i) => i.action?.type === "tradeOffer");
    if (offer && offer.action?.type === "tradeOffer") {
      gmChoose(s, data, offer.id, "accept");
      expect(s.gm!.roster).toEqual(expect.arrayContaining(offer.action.get));
    }
  });
});

describe("storylines, academy, awards, calendar", () => {
  it("prospects develop, promote onto the roster and can play", () => {
    const s = season("ac-1");
    const ids = Object.keys(s.gm!.prospects!);
    expect(ids).toHaveLength(12);
    const id = ids[0]!;
    gmSignProspect(s, id);
    expect(() => {
      for (const x of ids.slice(1, ACADEMY_MAX + 1)) gmSignProspect(s, x);
    }).toThrow(/holds/);
    const before = overall(s.gm!.prospects![id]!.player.ratings);
    advance(s, data);
    expect(overall(s.gm!.prospects![id]!.player.ratings)).toBeGreaterThan(before);
    while (!tradesOpen(s)) advance(s, data);
    gmPromoteProspect(s, id);
    expect(s.gm!.roster).toContain(id);
    gmSetStarters(s, [id, ...s.gm!.starters.filter((x) => x !== id).slice(0, 3)]);
    advance(s, data);
    const played = Object.values(s.series).some((r) => r.maps.some((m) => m.lineup.includes(id)));
    expect(played).toBe(true);
  });

  it("the calendar marks the windows and the trade deadline", () => {
    const s = season("cal-1");
    const rows = calendar(s, data);
    expect(rows).toHaveLength(s.steps.length);
    expect(rows[0]!.window).toEqual({ trades: true });
    expect(rows[rows.length - 1]!.window).toEqual({ trades: false });
    expect(rows.filter((r) => r.matches.length).length).toBeGreaterThan(10);
  });

  it("a full season hands out awards, raises reputations, and dynasty keeps staff and academy", () => {
    const s = season("aw-1");
    gmHire(s, staffPool(s).find((m) => m.role === "analyst" && m.rating === 2)!.id);
    const pro = Object.keys(s.gm!.prospects!)[0]!;
    gmSignProspect(s, pro);
    s.gm!.trust = 90;
    advanceSeason(s, data);
    const a = s.awards!;
    expect(a.mvp).toBeDefined();
    expect(a.allCdl[0]).toHaveLength(4);
    expect(a.allCdl[1]).toHaveLength(4);
    expect(s.reputation![a.mvp!]).toBeGreaterThan(1);
    expect(s.gm!.inbox!.some((i) => i.kind === "award")).toBe(true);
    // Award winners ask for more.
    const base = contractFor({ ...s, reputation: {} }, data, a.mvp!, 2).salary;
    expect(contractFor(s, data, a.mvp!, 2).salary).toBeGreaterThan(base);
    // Press conferences came up somewhere along the way.
    expect(s.gm!.inbox!.some((i) => i.kind === "press")).toBe(true);

    const next = startNextSeason(s, data);
    expect(next.gm!.staff!.analyst?.rating).toBe(2);
    expect(next.gm!.academy).toContain(pro);
    expect(next.gm!.prospects![pro]).toBeDefined();
    expect(Object.keys(next.gm!.prospects!).length).toBe(13);
  });
});
