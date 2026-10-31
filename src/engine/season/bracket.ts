// Brackets as data: each format is a list of match definitions whose slots point at a
// seed or at the winner/loser of an earlier match. One runner plays them all in order
// and assigns placements from each match's loserPlace / winnerPlace.
import type { BestOf, BracketFormat } from "../data/schema";

export type Src = { seed: number } | { winner: string } | { loser: string };

export type BracketSection = "upper" | "lower" | "final" | "playin" | "group" | "single";

export interface MatchDef {
  id: string;
  label: string;
  section: BracketSection;
  /** Column for display, 1-based within its section. */
  round: number;
  group?: string;
  bestOf: BestOf;
  a: Src;
  b: Src;
  loserPlace?: [number, number];
  winnerPlace?: [number, number];
}

export interface BracketPlan {
  defs: MatchDef[];
  /** Seeds eliminated without playing (2026 Major II seeds 11-12). */
  byePlaces: { seed: number; place: [number, number] }[];
  /** Number of seeded teams the plan expects. */
  size: number;
}

const S = (seed: number): Src => ({ seed });
const W = (id: string): Src => ({ winner: id });
const L = (id: string): Src => ({ loser: id });

/**
 * Double elimination for 8 upper-bracket slots, optionally with 4 lower-bracket entrants
 * (CDL 12-team Major: seeds 9-12 start in Losers R1 against the Winners R1 losers).
 * `upper` lists slots in Winners R1 pairing order: [a1, b1, a2, b2, a3, b3, a4, b4].
 */
export function doubleElim(prefix: string, upper: Src[], entrants: Src[], bo: BestOf, finalBo: BestOf): MatchDef[] {
  if (upper.length !== 8) throw new Error("double elimination expects 8 upper slots");
  if (entrants.length !== 0 && entrants.length !== 4) throw new Error("lower-bracket entrants must be 0 or 4");
  const id = (s: string) => `${prefix}${s}`;
  const m = (s: string, label: string, section: BracketSection, round: number, a: Src, b: Src, extra: Partial<MatchDef> = {}): MatchDef => ({
    id: id(s), label, section, round, bestOf: bo, a, b, ...extra,
  });
  const defs: MatchDef[] = [
    m("W1", "Winners R1", "upper", 1, upper[0]!, upper[1]!),
    m("W2", "Winners R1", "upper", 1, upper[2]!, upper[3]!),
    m("W3", "Winners R1", "upper", 1, upper[4]!, upper[5]!),
    m("W4", "Winners R1", "upper", 1, upper[6]!, upper[7]!),
    m("WS1", "Winners Semifinal", "upper", 2, W(id("W1")), W(id("W2"))),
    m("WS2", "Winners Semifinal", "upper", 2, W(id("W3")), W(id("W4"))),
    m("WF", "Winners Final", "upper", 3, W(id("WS1")), W(id("WS2"))),
  ];
  let lowerRound = 1;
  if (entrants.length === 4) {
    // As in the real 2024-2025 Majors (Liquipedia brackets): the 1v8 loser plays seed 9,
    // 4v5 plays 12, 2v7 plays 10 and 3v6 plays 11 (entrants are seeds 9-12 in order).
    defs.push(
      m("L1a", "Losers R1", "lower", 1, L(id("W1")), entrants[0]!, { loserPlace: [9, 12] }),
      m("L1b", "Losers R1", "lower", 1, L(id("W2")), entrants[3]!, { loserPlace: [9, 12] }),
      m("L1c", "Losers R1", "lower", 1, L(id("W3")), entrants[1]!, { loserPlace: [9, 12] }),
      m("L1d", "Losers R1", "lower", 1, L(id("W4")), entrants[2]!, { loserPlace: [9, 12] }),
      m("L2a", "Losers R2", "lower", 2, W(id("L1a")), W(id("L1b")), { loserPlace: [7, 8] }),
      m("L2b", "Losers R2", "lower", 2, W(id("L1c")), W(id("L1d")), { loserPlace: [7, 8] }),
    );
    lowerRound = 3;
  } else {
    defs.push(
      m("L2a", "Losers R1", "lower", 1, L(id("W1")), L(id("W2")), { loserPlace: [7, 8] }),
      m("L2b", "Losers R1", "lower", 1, L(id("W3")), L(id("W4")), { loserPlace: [7, 8] }),
    );
    lowerRound = 2;
  }
  const r = (k: number) => `Losers R${lowerRound + k}`;
  defs.push(
    // Cross the dropping semifinal losers so nobody replays the team that just beat them.
    m("L3a", r(0), "lower", lowerRound, W(id("L2a")), L(id("WS2")), { loserPlace: [5, 6] }),
    m("L3b", r(0), "lower", lowerRound, W(id("L2b")), L(id("WS1")), { loserPlace: [5, 6] }),
    m("L4", r(1), "lower", lowerRound + 1, W(id("L3a")), W(id("L3b")), { loserPlace: [4, 4] }),
    m("LF", "Losers Final", "lower", lowerRound + 2, W(id("L4")), L(id("WF")), { loserPlace: [3, 3] }),
    { ...m("GF", "Grand Final", "final", 1, W(id("WF")), W(id("LF")), { loserPlace: [2, 2], winnerPlace: [1, 1] }), bestOf: finalBo },
  );
  return defs;
}

/** Standard 1v8, 4v5, 2v7, 3v6 pairing for eight sources given in seed order. */
const upperPairs = (s: Src[]) => [s[0]!, s[7]!, s[3]!, s[4]!, s[1]!, s[6]!, s[2]!, s[5]!];

export function bracketPlan(format: BracketFormat, bo: BestOf, finalBo: BestOf): BracketPlan {
  switch (format.type) {
    case "double-elim": {
      if (format.winnersSeeds.length !== 8) throw new Error("double-elim needs 8 winners-bracket seeds");
      return {
        defs: doubleElim("", upperPairs(format.winnersSeeds.map(S)), format.losersSeeds.map(S), bo, finalBo),
        byePlaces: [],
        size: format.winnersSeeds.length + format.losersSeeds.length,
      };
    }
    case "double-elim-playin": {
      const [p1, p2, p3, p4] = format.playinSeeds;
      if (format.mainSeeds.length !== 6 || format.playinSeeds.length !== 4 || format.playinSpots !== 2) {
        throw new Error("play-in format supports 6 main seeds + 4 play-in seeds for 2 spots");
      }
      const pi: MatchDef[] = [
        { id: "PI1", label: "Play-In", section: "playin", round: 1, bestOf: bo, a: S(p1!), b: S(p4!), loserPlace: [9, 10] },
        { id: "PI2", label: "Play-In", section: "playin", round: 1, bestOf: bo, a: S(p2!), b: S(p3!), loserPlace: [9, 10] },
      ];
      const main = [...format.mainSeeds.map(S), W("PI1"), W("PI2")];
      const n = format.mainSeeds.length + format.playinSeeds.length;
      return {
        defs: [...pi, ...doubleElim("", upperPairs(main), [], bo, finalBo)],
        byePlaces: format.eliminatedSeeds.map((seed) => ({ seed, place: [n + 1, n + format.eliminatedSeeds.length] })),
        size: n + format.eliminatedSeeds.length,
      };
    }
    case "single-elim": {
      if (format.size !== 12 || format.byes !== 4) throw new Error("single-elim supports 12 teams with 4 byes");
      const d = (id: string, label: string, round: number, a: Src, b: Src, place: [number, number], extra: Partial<MatchDef> = {}): MatchDef => ({
        id, label, section: "single", round, bestOf: bo, a, b, loserPlace: place, ...extra,
      });
      return {
        defs: [
          d("R1a", "Round 1", 1, S(8), S(9), [9, 12]),
          d("R1b", "Round 1", 1, S(5), S(12), [9, 12]),
          d("R1c", "Round 1", 1, S(7), S(10), [9, 12]),
          d("R1d", "Round 1", 1, S(6), S(11), [9, 12]),
          d("QFa", "Quarterfinal", 2, S(1), W("R1a"), [5, 8]),
          d("QFb", "Quarterfinal", 2, S(4), W("R1b"), [5, 8]),
          d("QFc", "Quarterfinal", 2, S(2), W("R1c"), [5, 8]),
          d("QFd", "Quarterfinal", 2, S(3), W("R1d"), [5, 8]),
          d("SFa", "Semifinal", 3, W("QFa"), W("QFb"), [3, 4]),
          d("SFb", "Semifinal", 3, W("QFc"), W("QFd"), [3, 4]),
          d("F", "Final", 4, W("SFa"), W("SFb"), [2, 2], { winnerPlace: [1, 1], bestOf: finalBo }),
        ],
        byePlaces: [],
        size: 12,
      };
    }
    case "proam-gsl": {
      if (format.groups !== 4 || format.groupSize !== 4 || format.advancePerGroup !== 2) {
        throw new Error("Pro-Am supports 4 GSL groups of 4 with 2 advancing");
      }
      // Snake draw: A gets seeds 1, 8, 9, 16; B 2, 7, 10, 15; C 3, 6, 11, 14; D 4, 5, 12, 13.
      const groups = { A: [1, 8, 9, 16], B: [2, 7, 10, 15], C: [3, 6, 11, 14], D: [4, 5, 12, 13] };
      const defs: MatchDef[] = [];
      for (const [g, [s1, s2, s3, s4]] of Object.entries(groups) as [string, number[]][]) {
        const gm = (id: string, label: string, round: number, a: Src, b: Src, extra: Partial<MatchDef> = {}): MatchDef => ({
          id: `${g}-${id}`, label: `Group ${g} ${label}`, section: "group", round, group: g, bestOf: bo, a, b, ...extra,
        });
        defs.push(
          gm("O1", "Opening", 1, S(s1!), S(s4!)),
          gm("O2", "Opening", 1, S(s2!), S(s3!)),
          gm("WM", "Winners", 2, W(`${g}-O1`), W(`${g}-O2`)),
          gm("EM", "Elimination", 2, L(`${g}-O1`), L(`${g}-O2`), { loserPlace: [13, 16] }),
          gm("DM", "Decider", 3, L(`${g}-WM`), W(`${g}-EM`), { loserPlace: [9, 12] }),
        );
      }
      // Group winners meet other groups' runners-up in Winners R1.
      const upper = [W("A-WM"), W("B-DM"), W("D-WM"), W("C-DM"), W("B-WM"), W("A-DM"), W("C-WM"), W("D-DM")];
      return { defs: [...defs, ...doubleElim("", upper, [], bo, finalBo)], byePlaces: [], size: 16 };
    }
  }
}

export interface PlayedMatch {
  def: MatchDef;
  teams: [string, string];
  /** Series id of the played match (season-unique). */
  seriesId: string;
  winner: string;
  loser: string;
  score: [number, number];
}

export interface BracketRun {
  matches: PlayedMatch[];
  /** team -> placement range */
  placements: Record<string, [number, number]>;
}

/**
 * Plays a bracket. `seeds[i]` is seed i+1. The better-seeded team is always side 0.
 * `play` simulates one series and returns its id and map score (side 0 first).
 */
export function runBracket(
  plan: BracketPlan,
  seeds: string[],
  play: (def: MatchDef, teams: [string, string]) => { seriesId: string; score: [number, number] },
): BracketRun {
  if (seeds.length !== plan.size) throw new Error(`bracket expects ${plan.size} seeds, got ${seeds.length}`);
  const seedOf = new Map(seeds.map((t, i) => [t, i + 1]));
  const results = new Map<string, PlayedMatch>();
  const placements: Record<string, [number, number]> = {};
  const resolve = (src: Src): string => {
    if ("seed" in src) {
      const t = seeds[src.seed - 1];
      if (!t) throw new Error(`no team for seed ${src.seed}`);
      return t;
    }
    const id = "winner" in src ? src.winner : src.loser;
    const r = results.get(id);
    if (!r) throw new Error(`match ${id} referenced before it was played`);
    return "winner" in src ? r.winner : r.loser;
  };

  for (const { seed, place } of plan.byePlaces) placements[seeds[seed - 1]!] = place;
  const matches: PlayedMatch[] = [];
  for (const def of plan.defs) {
    const a = resolve(def.a);
    const b = resolve(def.b);
    const teams: [string, string] = seedOf.get(a)! <= seedOf.get(b)! ? [a, b] : [b, a];
    const { seriesId, score } = play(def, teams);
    const winner = score[0] > score[1] ? teams[0] : teams[1];
    const loser = winner === teams[0] ? teams[1] : teams[0];
    const pm: PlayedMatch = { def, teams, seriesId, winner, loser, score };
    results.set(def.id, pm);
    matches.push(pm);
    if (def.loserPlace) placements[loser] = def.loserPlace;
    if (def.winnerPlace) placements[winner] = def.winnerPlace;
  }
  return { matches, placements };
}
