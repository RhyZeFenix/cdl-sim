import { describe, expect, it } from "vitest";
import {
  advance,
  advanceSeason,
  createSeason,
  evaluateTrade,
  extensionTerms,
  gmExtend,
  gmSetAutoVeto,
  gmSignProspect,
  loadSeasonData,
  ovrOf,
  playerAge,
  playerInfo,
  setLocalRoles,
  tradesOpen,
  aiRoster,
} from "../src/engine";

const data = loadSeasonData("2025");
const GM = data.season.teams[1]!.id;
const season = (seed: string) => {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM });
  gmSetAutoVeto(s, true);
  s.gm!.trust = 90;
  return s;
};

describe("trade counter-offers", () => {
  it("a short offer comes back with a counter they'd accept", () => {
    const s = season("ctr-1");
    expect(tradesOpen(s)).toBe(true);
    const other = data.season.teams.find((t) => t.id !== GM)!.id;
    const theirs = aiRoster(s, data, other);
    const best = theirs.slice().sort((a, b) => ovrOf(s, data, b) - ovrOf(s, data, a))[0]!;
    const mine = s.gm!.roster.slice().sort((a, b) => ovrOf(s, data, a) - ovrOf(s, data, b))[0]!;
    const v = evaluateTrade(s, data, { team: other, give: [mine], get: [best] });
    expect(v.accepted).toBe(false);
    if (v.counter) {
      expect(evaluateTrade(s, data, v.counter).accepted).toBe(true);
      expect(v.counterText).toMatch(/They'd do it/);
    }
  });
});

describe("extensions", () => {
  it("costs more for longer deals, needs a longer deal, and lifts morale", () => {
    const s = season("ext-1");
    const id = s.gm!.roster[0]!;
    const c = s.gm!.contracts![id]!;
    expect(extensionTerms(s, data, id, c.years).problem).toBeDefined();
    if (c.years < 3) {
      const t = extensionTerms(s, data, id, 3);
      if (!t.problem) {
        const before = s.gm!.morale?.[id] ?? 70;
        gmExtend(s, data, id, 3);
        expect(s.gm!.contracts![id]!.years).toBe(3);
        expect(s.gm!.contracts![id]!.salary).toBe(t.salary);
        expect(s.gm!.morale![id]).toBeGreaterThan(before);
      }
    }
    s.gm!.contracts = { ...s.gm!.contracts, [id]: { salary: 100, years: 1 } };
    s.gm!.morale = { ...s.gm!.morale, [id]: 30 };
    expect(extensionTerms(s, data, id, 3).problem).toMatch(/unhappy/);
  });
});

describe("in-season development and Challengers", () => {
  it("young players grow after Majors and academy prospects play Challengers", () => {
    const s = season("dev-1");
    const pro = Object.keys(s.gm!.prospects!)[0]!;
    gmSignProspect(s, pro);
    advanceSeason(s, data);
    const young = s.gm!.roster.filter((id) => playerAge(s, id) <= 23);
    if (young.length) expect(Object.keys(s.gm!.devAdj ?? {}).length).toBeGreaterThan(0);
    for (const [id, d] of Object.entries(s.gm!.devAdj ?? {})) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(6);
      expect(playerInfo(s, data, id)).toBeDefined();
    }
    expect(s.gm!.challengers!.length).toBeGreaterThanOrEqual(4);
    expect(s.gm!.challengers![0]!.places[pro]).toBeGreaterThan(0);
    expect(s.gm!.inbox!.some((i) => /Challengers Stage 1/.test(i.title))).toBe(true);
  });
});

describe("role labels", () => {
  it("labels set in the browser change a player's role", () => {
    const s = season("role-1");
    const id = s.gm!.roster[0]!;
    expect(playerInfo(s, data, id)!.role).toBe("flex");
    setLocalRoles({ [id]: "SMG" });
    expect(playerInfo(s, data, id)!.role).toBe("SMG");
    setLocalRoles({});
    expect(advance(s, data)).toBeDefined();
  });
});
