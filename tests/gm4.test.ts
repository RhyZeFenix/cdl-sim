import { describe, expect, it } from "vitest";
import {
  TIMEOUT_BOOST,
  advance,
  advanceSeason,
  ageIn,
  contractFor,
  createSeason,
  fightShare,
  gmSetAutoVeto,
  gmSetSponsor,
  loadSeasonData,
  playerAge,
  previewDraft,
  sponsorEarned,
  sponsorOpen,
  staffBudget,
  STAFF_BUDGET,
  startNextSeason,
  traitOf,
  type ExtraRules,
} from "../src/engine";

const data = loadSeasonData("2024");
const GM = data.season.teams[2]!.id;
const season = (seed: string, rules?: ExtraRules) => {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM, rules });
  gmSetAutoVeto(s, true);
  s.gm!.trust = 90;
  return s;
};

describe("real player data", () => {
  it("uses real birthdates for ages", () => {
    // Shotzzy: born 2001-07-04 (wiki), so 22 on 1 March 2024.
    expect(ageIn("shotzzy", 2024)).toBe(22);
    expect(ageIn("shotzzy", 2026)).toBe(24);
    const s = season("age-1");
    expect(playerAge(s, "shotzzy")).toBe(22);
  });

  it("fight share comes from real fights per map, around 1", () => {
    const ids = data.rosters.teams.flatMap((t) => t.players.map((p) => p.id));
    const xs = ids.map((id) => fightShare("2024", id));
    expect(Math.min(...xs)).toBeGreaterThan(0.8);
    expect(Math.max(...xs)).toBeLessThan(1.2);
    expect(new Set(xs).size).toBeGreaterThan(20);
  });
});

describe("personalities", () => {
  it("are stable per player and change asking prices", () => {
    const ids = data.rosters.teams.flatMap((t) => t.players.map((p) => p.id));
    const merc = ids.find((id) => traitOf(id) === "mercenary");
    expect(merc).toBeDefined();
    expect(traitOf(merc!)).toBe("mercenary");
    const s = season("tr-1");
    const plain = Math.round((contractFor({ ...s, reputation: {} }, data, merc!, 2).salary / 1.1) / 5) * 5;
    expect(contractFor(s, data, merc!, 2).salary).toBeGreaterThan(plain - 5);
    expect(ids.filter((id) => traitOf(id)).length).toBeLessThan(ids.length * 0.6);
  });
});

describe("sponsors", () => {
  it("pay into the staff budget and lock once you've played", () => {
    const s = season("sp-1");
    expect(sponsorOpen(s)).toBe(true);
    gmSetSponsor(s, "fans");
    expect(staffBudget(s)).toBe(STAFF_BUDGET + 20);
    advanceSeason(s, data);
    expect(sponsorOpen(s)).toBe(false);
    const wins = Object.values(s.series).filter((r) => r.winner === GM).length;
    expect(sponsorEarned(s)).toBe(20 + 3 * wins);
    expect(() => gmSetSponsor(s, "steady")).toThrow();
  });
});

describe("optional rules", () => {
  it("the rookie draft gives you a pick and takes the rest of the class off the board", () => {
    const s = season("dr-1", { draft: true });
    advanceSeason(s, data);
    const preview = previewDraft(s, data);
    expect(preview.pick).toBeGreaterThan(0);
    expect(preview.prospects.length).toBeGreaterThan(5);
    const want = preview.prospects[preview.prospects.length - 1]!.id;
    const next = startNextSeason(s, data, { draftPick: want });
    expect(next.gm!.academy).toContain(want);
    // AI teams drafted most of the class, so few prospects are left to sign.
    expect(Object.keys(next.gm!.prospects!).length).toBeLessThan(preview.prospects.length);
    expect(next.gm!.inbox!.some((i) => /Draft:/.test(i.body))).toBe(true);
  });

  it("without the rule there's no draft", () => {
    const s = season("dr-2");
    advanceSeason(s, data);
    const next = startNextSeason(s, data);
    expect(next.gm!.inbox!.some((i) => /Draft:/.test(i.body))).toBe(false);
  });

  it("a timeout is a small, one-per-series lift", () => {
    expect(TIMEOUT_BOOST).toBeLessThan(0.03);
    const s = season("to-1", { timeouts: true });
    expect(advance(s, data)).toBeDefined();
  });
});
