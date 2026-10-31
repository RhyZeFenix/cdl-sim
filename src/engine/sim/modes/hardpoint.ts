// Hardpoint: hill by hill. Each hill is a run of team fights; the fight winner holds
// and scores 1/s until the next fight or the rotation. The team that won the previous
// hill sets up first on the next one (momentum).
import type { ModeSettings } from "../../data/schema";
import { allAlive, aliveOn, clamp, pickBy, teamFight, type Arena } from "../arena";
import { TUNING } from "../tuning";
import type { Pair, Side } from "../types";

export function playHardpoint(a: Arena, s: ModeSettings["hp"], hills: number = TUNING.hp.hills): Pair {
  const T = TUNING.hp;
  const { rng } = a;
  const score: Pair = [0, 0];
  const done = () => score[0] >= s.target || score[1] >= s.target;
  let momentum: Side | null = null;
  let n = 0;

  while (!done()) {
    n++;
    const label = `P${((n - 1) % hills) + 1}`;
    const pts: Pair = [0, 0];
    const gap = rng.int(T.rotationGap[0], T.rotationGap[1]);
    let ht = gap;
    a.t += gap;
    let first = true;

    while (ht < s.hillSeconds && !done()) {
      const bonus: Pair = [0, 0];
      if (first && momentum !== null) bonus[momentum] = T.setupBonus;
      first = false;
      const f = teamFight(a, { bonus, kills: T.fightKills, killSecs: T.killSecs });
      ht += f.secs;
      if (ht >= s.hillSeconds) break;
      const w = f.winner;
      const margin = Math.abs(f.left[0] - f.left[1]) + Math.abs(f.kills[0] - f.kills[1]) / 2;
      let hold = Math.round(clamp(rng.normal(T.holdBase + T.holdPerMargin * margin, T.holdSd), T.holdMin, T.holdMax));
      hold = Math.min(hold, Math.floor(s.hillSeconds - ht), s.target - score[w]);
      if (hold <= 0) break;
      score[w] += hold;
      pts[w] += hold;
      // One to three players stand on the hill; objective-minded players more often.
      const pool = aliveOn(allAlive(), w);
      const on = new Set<number>();
      const count = rng.int(1, 3);
      while (on.size < count) on.add(pickBy(a, pool, (p) => p.ratings.hp_obj));
      a.t += hold;
      ht += hold;
      a.events.push({ k: "hold", t: Math.round(a.t), hill: n, team: w, secs: hold, on: [...on] });
    }

    if (pts[0] !== pts[1]) momentum = pts[0] > pts[1] ? 0 : 1;
    a.events.push({ k: "hill", t: Math.round(a.t), n, label, pts, score: [score[0], score[1]] });
  }
  return score;
}
