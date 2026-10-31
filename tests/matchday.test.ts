import { describe, expect, it } from "vitest";
import {
  advance,
  createSeason,
  gmMarkWatched,
  gmSetAutoVeto,
  gmSetSpoilerFree,
  isMatchDay,
  loadSeasonData,
  toggleWatch,
  markWatched,
  eventMatchIds,
  advanceStage,
  type SeasonState,
} from "../src/engine";
import { runSim } from "../src/ui/simWorker";
import { spoilers } from "../src/ui/spoilers";

const data = loadSeasonData("2026");
const GM = "optic-texas";

function season(seed: string): SeasonState {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM });
  gmSetAutoVeto(s, true);
  return s;
}

/** Watches (or skips) everything waiting, as the match day screen would. */
function watchAll(s: SeasonState) {
  for (const id of [...(s.gm!.unwatched ?? [])]) gmMarkWatched(s, id);
}

describe("spoiler-free match day", () => {
  it("queues the GM team's series as unwatched until watched or skipped", () => {
    const s = season("md-queue");
    advance(s, data);
    const gmIds = s.qualifiers[0]!.filter((id) => s.series[id]!.teams.includes(GM));
    expect(s.gm!.unwatched).toEqual(gmIds);
    expect(isMatchDay(s)).toBe(true);
    gmMarkWatched(s, gmIds[0]!);
    expect(s.gm!.unwatched).toEqual(gmIds.slice(1));
    watchAll(s);
    expect(isMatchDay(s)).toBe(false);
  });

  it("Sim season stops at the first match day and won't run past it", () => {
    const s = season("md-stop");
    runSim(s, "season");
    expect(s.next).toBe(1);
    expect(isMatchDay(s)).toBe(true);
    runSim(s, "season");
    expect(s.next).toBe(1);
    watchAll(s);
    runSim(s, "stage");
    expect(s.next).toBe(2);
  });

  it("hides the GM result from standings and points until watched", () => {
    const s = season("md-points");
    advance(s, data);
    const sp = spoilers(s, data);
    expect(sp.active).toBe(true);
    // The GM team's points leave out its hidden wins; everyone else's are current.
    expect(sp.points[GM]).toBe(0);
    const otherWinner = s.series[s.qualifiers[0]!.find((id) => !s.series[id]!.teams.includes(GM))!]!.winner;
    if (otherWinner !== GM) expect(sp.points[otherWinner]).toBe(s.points[otherWinner]);
    expect(sp.history).toHaveLength(1);
    for (const id of s.gm!.unwatched!) expect(sp.isHidden(id)).toBe(true);
    // Other teams' matches stay visible.
    const other = s.qualifiers[0]!.find((id) => !s.series[id]!.teams.includes(GM))!;
    expect(sp.isHidden(other)).toBe(false);
    watchAll(s);
    expect(spoilers(s, data).points).toEqual(s.points);
  });

  it("in a bracket, matches that depend on the unwatched one are hidden too", () => {
    const s = season("md-bracket");
    while (s.steps[s.next]!.kind !== "major") {
      advance(s, data);
      watchAll(s);
    }
    advance(s, data);
    const major = s.events[s.events.length - 1]!;
    const sp = spoilers(s, data);
    const first = s.gm!.unwatched![0]!;
    const firstDef = major.matches.find((m) => m.seriesId === first)!.def.id;
    // Anything fed by the GM team's first match (winner or loser) is hidden.
    const fed = major.matches.filter((m) =>
      [m.def.a, m.def.b].some((src) => ("winner" in src && src.winner === firstDef) || ("loser" in src && src.loser === firstDef)),
    );
    expect(fed.length).toBeGreaterThan(0);
    for (const m of fed) expect(sp.isHidden(m.seriesId)).toBe(true);
    expect(sp.eventHidden(major)).toBe(true);
    watchAll(s);
    expect(spoilers(s, data).eventHidden(major)).toBe(false);
  });

  it("turning spoiler-free off reveals everything and stops queueing", () => {
    const s = season("md-off");
    advance(s, data);
    gmSetSpoilerFree(s, false);
    expect(isMatchDay(s)).toBe(false);
    advance(s, data);
    expect(s.gm!.unwatched).toEqual([]);
  });
});

describe("watchlist (any match, any mode)", () => {
  it("a watched match stays hidden until watched, and only that match", () => {
    const s = createSeason(data, { seed: "wl-1", ratingMode: "historical" });
    const [fx, other] = s.schedule[0]![0]!;
    toggleWatch(s, fx!.id);
    expect(s.watchlist).toEqual([fx!.id]);
    advance(s, data);
    expect(s.unwatched).toEqual([fx!.id]);
    expect(s.watchlist).toEqual([]);
    expect(isMatchDay(s)).toBe(true);
    const sp = spoilers(s, data);
    expect(sp.isHidden(fx!.id)).toBe(true);
    expect(sp.isHidden(other!.id)).toBe(false);
    // Sims don't run past it.
    runSim(s, "season");
    expect(s.next).toBe(1);
    markWatched(s, fx!.id);
    expect(isMatchDay(s)).toBe(false);
  });

  it("an event's final can be queued before the bracket exists", () => {
    const s = createSeason(data, { seed: "wl-2", ratingMode: "historical" });
    advanceStage(s, data); // through Stage 1's Major
    const step = s.steps[s.next]!;
    expect(step.kind).toBe("week");
    // Queue Stage 2's Major final, then play the stage.
    const ids = eventMatchIds(data, "major", 2);
    toggleWatch(s, ids.final);
    advanceStage(s, data);
    const major = s.events.find((e) => e.kind === "major" && e.stage === 2)!;
    expect(major.matches.map((m) => m.seriesId)).toEqual(expect.arrayContaining(ids.all));
    expect(s.unwatched).toEqual([ids.final]);
    expect(spoilers(s, data).eventHidden(major)).toBe(true);
  });
});
