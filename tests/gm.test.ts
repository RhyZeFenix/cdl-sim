import { describe, expect, it } from "vitest";
import {
  advance,
  advanceSeason,
  advanceStage,
  createSeason,
  freeAgents,
  gmCanMakeMoves,
  gmRelease,
  gmSetAutoVeto,
  gmSetStarters,
  gmSign,
  gmVetoSession,
  isDone,
  loadSeasonData,
  replaySeries,
  submitGmVeto,
  teamLineup,
  type SeasonState,
} from "../src/engine";

const data = loadSeasonData("2026");
const GM = "optic-texas";

function gmSeason(seed = "gm", autoVeto = false): SeasonState {
  const s = createSeason(data, { seed, ratingMode: "historical", gmTeam: GM });
  gmSetAutoVeto(s, autoVeto);
  return s;
}

/** Answers every GM veto decision with a fixed policy and records the answers. */
function resolvePending(s: SeasonState, pick: (options: string[]) => string = (o) => o[o.length - 1]!) {
  const lineup = s.gm!.starters;
  const ctx = gmVetoSession(s, data, lineup, 1);
  const answers: string[] = [];
  while (ctx.session.pending) {
    const c = pick(ctx.session.pending.options);
    answers.push(c);
    ctx.session.answer(c);
  }
  submitGmVeto(s, { teamA: ctx.gmSide === 0 ? 1 : undefined, answers, lineup });
  return { ctx, answers, result: ctx.session.result() };
}

/** Advances one step, answering every GM veto the step stops at. */
function advanceResolving(s: SeasonState) {
  for (;;) {
    const step = advance(s, data);
    if (step || !s.pending) return step;
    resolvePending(s);
  }
}

describe("GM mode", () => {
  it("pauses at the GM team's series without advancing the step", () => {
    const s = gmSeason();
    const before = s.next;
    expect(advance(s, data)).toBeUndefined();
    expect(s.pending?.spec.teams).toContain(GM);
    expect(s.next).toBe(before);
    // Series before the GM's in the same week were played and kept.
    const week = s.schedule[0]![0]!;
    const gmIdx = week.findIndex((f) => f.teams.includes(GM));
    for (const f of week.slice(0, gmIdx)) expect(s.series[f.id]).toBeDefined();
    // Advancing again without a veto stays put.
    expect(advance(s, data)).toBeUndefined();
  });

  it("plays the GM series with exactly the veto the user saw", () => {
    const s = gmSeason("veto");
    advance(s, data);
    const id = s.pending!.spec.id;
    const { ctx, result } = resolvePending(s);
    expect(advanceResolving(s)?.kind).toBe("week");
    const rec = s.series[id]!;
    expect(rec.veto).toEqual(result);
    expect(rec.gmVeto?.answers.length).toBeGreaterThan(0);
    expect(rec.lineups![ctx.gmSide]).toEqual(s.gm!.starters);
    // GM series keep full events and replay identically.
    expect(rec.hasEvents).toBe(true);
    const re = replaySeries(s, data, id);
    expect(re.veto).toEqual(rec.veto);
    expect(re.score).toEqual(rec.score);
  });

  it("a resumed week counts each qualifier win once", () => {
    const s = gmSeason("resume");
    advanceResolving(s);
    const ids = s.qualifiers[0]!;
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(s.schedule[0]![0]!.length);
    const total = Object.values(s.points).reduce((a, b) => a + b, 0);
    expect(total).toBe(ids.length * 10);
  });

  it("completes a full season with interactive vetoes, deterministically", () => {
    const run = () => {
      const s = gmSeason("full");
      let guard = 0;
      while (!isDone(s)) {
        advanceSeason(s, data);
        if (s.pending) resolvePending(s);
        if (++guard > 200) throw new Error("stuck");
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const gmSeries = Object.values(a.series).filter((r) => r.teams.includes(GM));
    expect(gmSeries.length).toBeGreaterThan(20);
    expect(gmSeries.every((r) => r.gmVeto)).toBe(true);
  });

  it("auto-veto lets the AI decide and never pauses", () => {
    const s = gmSeason("auto", true);
    advanceStage(s, data);
    expect(s.pending).toBeUndefined();
    expect(s.steps[s.next - 1]!.kind).toBe("major");
  });

  it("starters can be changed and are used in the next series", () => {
    const s = gmSeason("lineup", true);
    const [a, b, c, d] = s.gm!.starters;
    expect(() => gmSetStarters(s, [a!, b!, c!, c!])).toThrow(/four different/);
    gmSetStarters(s, [d!, c!, b!, a!]);
    advance(s, data);
    const rec = Object.values(s.series).find((r) => r.teams.includes(GM))!;
    const side = rec.teams[0] === GM ? 0 : 1;
    expect(rec.lineups![side]).toEqual([d, c, b, a]);
  });
});

describe("GM roster moves", () => {
  it("are only allowed before the season and between stages", () => {
    const s = gmSeason("moves", true);
    expect(gmCanMakeMoves(s)).toBe(true);
    advance(s, data);
    expect(gmCanMakeMoves(s)).toBe(false);
    expect(() => gmSign(s, data, freeAgents(s, data)[0]!)).toThrow(/between stages/);
    advanceStage(s, data);
    expect(s.steps[s.next - 1]!.kind).toBe("major");
    expect(gmCanMakeMoves(s)).toBe(true);
  });

  it("sign, start and release a free agent; roster size limits hold", () => {
    const s = gmSeason("sign", true);
    const fa = freeAgents(s, data);
    expect(fa.length).toBeGreaterThan(0);
    for (const id of s.gm!.roster) expect(fa).not.toContain(id);
    gmSign(s, data, fa[0]!);
    gmSign(s, data, fa[1]!);
    expect(() => gmSign(s, data, fa[2]!)).toThrow(/full/);
    gmSetStarters(s, [fa[0]!, ...s.gm!.starters.slice(1)]);
    gmRelease(s, data, s.gm!.roster[1]!);
    gmRelease(s, data, s.gm!.roster[1]!);
    expect(() => gmRelease(s, data, s.gm!.roster[0]!)).toThrow(/at least 4/);
    expect(s.gm!.starters).toHaveLength(4);
    expect(new Set(s.gm!.starters).size).toBe(4);
    expect(s.gm!.moves.map((m) => m.action)).toEqual(["sign", "sign", "release", "release"]);
  });

  it("an AI team never fields a player the GM has signed", () => {
    const s = gmSeason("poach", true);
    // Sign a player who starts for another team later in the season.
    const later = data.rosters.teams
      .filter((t) => t.team !== GM)
      .flatMap((t) => t.snapshots.slice(1).flatMap((sn) => sn.starters.map((p) => ({ team: t.team, p, date: sn.effective }))));
    const fa = new Set(freeAgents(s, data));
    const target = later.find((x) => fa.has(x.p))!;
    expect(target).toBeDefined();
    gmSign(s, data, target.p);
    const lineup = teamLineup(s, data, target.team, target.date);
    expect(lineup).not.toContain(target.p);
    expect(lineup).toHaveLength(4);
    advanceSeason(s, data);
    for (const r of Object.values(s.series)) {
      r.teams.forEach((t, i) => {
        if (t !== GM) expect(r.lineups![i]).not.toContain(target.p);
      });
    }
  });
});
