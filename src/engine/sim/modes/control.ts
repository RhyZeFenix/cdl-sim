// Control: round by round, attack/defense alternate, each side has a shared life pool.
// Attackers build capture progress by winning fights; a round ends on a full capture
// (both zones), on time (defense wins), or when a side's lives run out.
import type { ModeSettings } from "../../data/schema";
import { aliveOn, allAlive, pickBy, teamFight, type Arena } from "../arena";
import { TUNING } from "../tuning";
import { other, type MapEvent, type Pair, type Side } from "../types";

export function playControl(a: Arena, s: NonNullable<ModeSettings["control"]>, firstAtk: Side): Pair {
  const T = TUNING.control;
  const { rng } = a;
  const score: Pair = [0, 0];
  let n = 0;

  while (score[0] < s.roundsToWin && score[1] < s.roundsToWin) {
    n++;
    const atk: Side = n % 2 === 1 ? firstAtk : other(firstAtk);
    const def = other(atk);
    const lives: Pair = [s.livesPerTeam, s.livesPerTeam];
    let zones = 0;
    let progress = 0;
    let t = 0;
    let winner: Side | null = null;
    let how: Extract<MapEvent, { k: "round" }>["how"] = "time";

    while (winner === null) {
      if (t >= T.roundSecs) {
        winner = def;
        how = "time";
        break;
      }
      const bonus: Pair = [0, 0];
      bonus[def] = T.defenseBonus;
      const f = teamFight(a, { bonus, kills: T.fightKills, killSecs: T.killSecs });
      lives[0] -= f.kills[1];
      lives[1] -= f.kills[0];
      const gap = rng.int(T.gapSecs[0], T.gapSecs[1]);
      t += f.secs + gap;
      a.t += gap;

      if (lives[atk] <= 0) {
        winner = def;
        how = "lives";
      } else if (lives[def] <= 0) {
        winner = atk;
        how = "lives";
      } else if (f.winner === atk) {
        const margin = Math.abs(f.left[0] - f.left[1]);
        progress += T.progressBase + T.progressPerMargin * margin;
        if (progress >= 100) {
          zones++;
          progress = 0;
          const by = pickBy(a, aliveOn(allAlive(), atk), (p) => p.ratings.third_mode);
          a.events.push({ k: "zone", t: Math.round(a.t), team: atk, zone: zones === 1 ? "A" : "B", by });
          if (zones === 2) {
            winner = atk;
            how = "capture";
          }
        }
      } else {
        progress = Math.max(0, progress - T.progressDecay);
      }
    }

    score[winner]++;
    a.t += 5;
    a.events.push({
      k: "round",
      t: Math.round(a.t),
      n,
      atk,
      winner,
      how,
      score: [score[0], score[1]],
      lives: [Math.max(0, lives[0]), Math.max(0, lives[1])],
    });
  }
  return score;
}
