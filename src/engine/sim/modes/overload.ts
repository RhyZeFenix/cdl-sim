// Overload: one neutral device. Win a fight to pick it up; keep winning fights while
// carrying to push it into an enemy zone. Losing a fight while carrying drops it to
// the other team. Halves end on time or when a team reaches the half's score target;
// a tie after two halves goes to sudden death (next capture wins).
import type { ModeSettings } from "../../data/schema";
import { aliveOn, allAlive, pickBy, teamFight, type Arena } from "../arena";
import { TUNING } from "../tuning";
import type { Pair, Side } from "../types";

export function playOverload(a: Arena, s: NonNullable<ModeSettings["overload"]>): Pair {
  const T = TUNING.overload;
  const { rng } = a;
  const score: Pair = [0, 0];
  let holder: Side | null = null;
  let carrier = -1;
  let progress = 0;

  const carrierFor = (side: Side) => pickBy(a, aliveOn(allAlive(), side), (p) => p.ratings.third_mode);

  /** One possession step. Returns true if a capture happened. */
  const step = (): boolean => {
    const f = teamFight(a, { bonus: [0, 0], kills: T.fightKills, killSecs: T.killSecs });
    a.t += rng.int(T.gapSecs[0], T.gapSecs[1]);
    const w = f.winner;
    if (holder === null) {
      holder = w;
      carrier = carrierFor(w);
      progress = 0;
      a.events.push({ k: "pickup", t: Math.round(a.t), by: carrier });
      return false;
    }
    if (w === holder) {
      progress += 1 + (Math.abs(f.left[0] - f.left[1]) >= 2 ? 1 : 0);
      if (progress >= T.capNeed) {
        score[w]++;
        a.events.push({ k: "ocap", t: Math.round(a.t), by: carrier, team: w, score: [score[0], score[1]] });
        holder = null;
        progress = 0;
        return true;
      }
      return false;
    }
    a.events.push({ k: "drop", t: Math.round(a.t), by: carrier });
    holder = w;
    carrier = carrierFor(w);
    progress = 0;
    a.events.push({ k: "pickup", t: Math.round(a.t), by: carrier });
    return false;
  };

  for (const half of [1, 2]) {
    const start = a.t;
    const target = half === 1 ? s.halfCap : s.scoreCap;
    holder = null;
    progress = 0;
    while (a.t - start < s.halfSeconds && Math.max(score[0], score[1]) < target) step();
    a.events.push({ k: "half", t: Math.round(a.t), n: half, score: [score[0], score[1]] });
    if (Math.max(score[0], score[1]) >= s.scoreCap) break;
  }

  if (score[0] === score[1]) {
    a.events.push({ k: "sudden", t: Math.round(a.t) });
    holder = null;
    progress = 0;
    while (!step());
  }
  return score;
}
