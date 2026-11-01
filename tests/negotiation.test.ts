import { describe, expect, it } from "vitest";
import {
  advanceSeason,
  capSpace,
  contractFor,
  createSeason,
  fogRange,
  fogWidth,
  freeAgents,
  gmHire,
  gmSetFog,
  staffPool,
  gmCanMakeMoves,
  gmSetAutoVeto,
  gmSignOffer,
  loadSeasonData,
  negotiate,
  optionPlayers,
  ovrOf,
  previewFreeAgents,
  startNextSeason,
} from "../src/engine";

const data = loadSeasonData("2024");
const GM = data.season.teams[3]!.id;
const season = (seed: string) => {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM });
  gmSetAutoVeto(s, true);
  s.gm!.trust = 90;
  return s;
};
const bestFa = (s: ReturnType<typeof season>) => freeAgents(s, data).sort((a, b) => ovrOf(s, data, b) - ovrOf(s, data, a))[0]!;

describe("contract negotiation", () => {
  it("a lowball gets a counter that they then accept", () => {
    const s = season("neg-1");
    const id = bestFa(s);
    const ask = contractFor(s, data, id, 2).salary;
    const low = negotiate(s, data, id, { salary: Math.round(ask * 0.5), years: 2 });
    expect(low.accepted).toBe(false);
    expect(low.counter!.salary).toBeGreaterThan(Math.round(ask * 0.5));
    expect(negotiate(s, data, id, low.counter!).accepted).toBe(true);
  });

  it("a signing bonus lowers the salary they need, and an option raises it", () => {
    const s = season("neg-2");
    const id = bestFa(s);
    const plain = negotiate(s, data, id, { salary: 0, years: 2 }).counter!.salary;
    const bonus = negotiate(s, data, id, { salary: 0, years: 2, bonus: 100 }).counter!.salary;
    const option = negotiate(s, data, id, { salary: 0, years: 2, option: true }).counter!.salary;
    expect(bonus).toBeLessThan(plain);
    expect(option).toBeGreaterThan(plain);
  });

  it("signing with a bonus charges this season's cap and keeps the option", () => {
    const s = season("neg-3");
    expect(gmCanMakeMoves(s)).toBe(true);
    const id = freeAgents(s, data).sort((a, b) => ovrOf(s, data, a) - ovrOf(s, data, b))[0]!;
    const counter = negotiate(s, data, id, { salary: 0, years: 2, bonus: 20, option: true }).counter!;
    const before = capSpace(s);
    gmSignOffer(s, data, id, counter);
    expect(s.gm!.roster).toContain(id);
    expect(s.gm!.contracts![id]).toEqual({ salary: counter.salary, years: 2, option: true });
    expect(before - capSpace(s)).toBe(counter.salary + 20);
  });

  it("the off-season has team options and a free-agent class with bids", () => {
    const s = season("neg-4");
    advanceSeason(s, data);
    const id = s.gm!.roster[0]!;
    s.gm!.contracts![id] = { salary: 150, years: 1, option: true };
    expect(optionPlayers(s)).toContain(id);
    const pool = previewFreeAgents(s, data);
    expect(pool.length).toBeGreaterThan(5);
    const target = pool[pool.length - 1]!;
    const next = startNextSeason(s, data, { exercise: [id], offers: { [target.id]: { salary: target.ask * 2, years: 2 } } });
    expect(next.gm!.roster).toContain(id);
    expect(next.gm!.contracts![id]).toEqual({ salary: 150, years: 1 });
    expect(next.gm!.roster).toContain(target.id);
    expect(next.gm!.inbox!.some((i) => /Free agency/.test(i.body))).toBe(true);
  });
});

describe("scouting fog", () => {
  it("other teams' ratings are ranges that narrow with an analyst; yours are exact", () => {
    const s = season("fog-1");
    const mine = s.gm!.roster[0]!;
    const other = bestFa(s);
    expect(fogWidth(s, data, mine)).toBe(0);
    const before = fogWidth(s, data, other);
    expect(before).toBeGreaterThan(0);
    gmHire(s, staffPool(s).find((m) => m.role === "analyst" && m.rating >= 4)!.id);
    expect(fogWidth(s, data, other)).toBeLessThan(before);
    const [lo, hi] = fogRange(80, 10, "x/ovr");
    expect(lo).toBeLessThanOrEqual(80);
    expect(hi).toBeGreaterThanOrEqual(80);
    expect(hi - lo).toBe(10);
    gmSetFog(s, false);
    expect(fogWidth(s, data, other)).toBe(0);
  });
});
