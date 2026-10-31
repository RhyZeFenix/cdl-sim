// Search & Destroy: round by round, one life each, sides swap every round.
// A round is a sequence of 1v1 gunfights with plant / retake / defuse logic.
import type { ModeSettings } from "../../data/schema";
import { aliveOn, allAlive, clamp, countAlive, duelStep, pickBy, type Arena } from "../arena";
import { TUNING } from "../tuning";
import { other, type MapEvent, type Pair, type Side } from "../types";

export function playSnd(a: Arena, s: ModeSettings["snd"], firstAtk: Side): Pair {
  const T = TUNING.snd;
  const { rng } = a;
  const score: Pair = [0, 0];
  let n = 0;

  while (score[0] < s.roundsToWin && score[1] < s.roundsToWin) {
    n++;
    const atk: Side = n % 2 === 1 ? firstAtk : other(firstAtk);
    const def = other(atk);
    const alive = allAlive();
    const roundStart = a.t;
    let t = 0;
    let planted = false;
    let plantT = 0;
    let fb = true;
    // When a side first drops to one player: who, and how many they faced.
    const lone: Array<{ by: number; vs: number } | null> = [null, null];
    let winner: Side | null = null;
    let how: Extract<MapEvent, { k: "round" }>["how"] = "elim";

    while (winner === null) {
      if (!planted) {
        if (t >= s.roundSeconds) {
          winner = def;
          how = "time";
          break;
        }
        const adv = countAlive(alive, atk) - countAlive(alive, def);
        const p = clamp(T.plantBase + T.plantPerAdv * adv + (t > T.latePlantAfter ? T.latePlantBoost : 0), 0.02, 0.95);
        if (rng.chance(p)) {
          planted = true;
          plantT = t;
          const by = pickBy(a, aliveOn(alive, atk), (pl) => pl.ratings.snd_iq);
          a.events.push({ k: "plant", t: Math.round(roundStart + t), by, site: rng.chance(0.5) ? "A" : "B" });
          t += rng.int(3, 6);
          continue;
        }
      } else if (t - plantT >= s.bombSeconds) {
        winner = atk;
        how = "detonate";
        break;
      }

      const bonus: Pair = [0, 0];
      if (planted) bonus[atk] += T.postPlantBonus;
      else bonus[def] += T.defenseBonus;
      a.t = roundStart + t;
      duelStep(a, alive, bonus, { fb, clutch: true });
      fb = false;
      t += rng.int(T.stepSecs[0], T.stepSecs[1]);

      for (const side of [0, 1] as const) {
        const mine = aliveOn(alive, side);
        const theirs = countAlive(alive, other(side));
        if (!lone[side] && mine.length === 1 && theirs >= 1) lone[side] = { by: mine[0]!, vs: theirs };
      }

      if (countAlive(alive, atk) === 0) {
        if (planted) {
          const left = s.bombSeconds - (t - plantT);
          if (left >= T.defuseSecs) {
            winner = def;
            how = "defuse";
            const by = pickBy(a, aliveOn(alive, def), (pl) => pl.ratings.snd_iq);
            a.events.push({ k: "defuse", t: Math.round(roundStart + t + T.defuseSecs), by });
          } else {
            winner = atk;
            how = "detonate";
          }
        } else {
          winner = def;
          how = "elim";
        }
      } else if (countAlive(alive, def) === 0) {
        winner = atk;
        how = planted ? "detonate" : "elim";
      }
    }

    const clutch = lone[winner];
    if (clutch && alive[clutch.by]) {
      a.events.push({ k: "clutch", t: Math.round(roundStart + t), by: clutch.by, vs: clutch.vs });
    }
    score[winner]++;
    a.t = roundStart + t + 5;
    a.events.push({ k: "round", t: Math.round(a.t), n, atk, winner, how, score: [score[0], score[1]] });
  }
  return score;
}
