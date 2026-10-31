// Storylines: win and loss streaks, rivalries that heat up with every meeting, and
// press conferences after big matches where the GM picks the message.
import type { SeasonData } from "../data/registry";
import type { SeasonState, SeriesRecord } from "../season/season";
import { pushInbox } from "./inbox";
import { addMorale } from "./morale";

/** Real rivalries start warm (team ids containing these pairs). */
const REAL_RIVALRIES: [string, string][] = [
  ["optic", "faze"],
  ["optic", "thieves"],
  ["faze", "thieves"],
  ["ultra", "koi"],
];

export function initialRivals(state: SeasonState, data: SeasonData): Record<string, number> {
  const me = state.gm!.team;
  const out: Record<string, number> = {};
  for (const t of data.season.teams) {
    if (t.id === me) continue;
    if (REAL_RIVALRIES.some(([a, b]) => (me.includes(a) && t.id.includes(b)) || (me.includes(b) && t.id.includes(a)))) out[t.id] = 40;
  }
  return out;
}

export const RIVAL_HOT = 50;
export const isRival = (state: SeasonState, team: string) => (state.gm?.rivals?.[team] ?? 0) >= RIVAL_HOT;

const teamName = (data: SeasonData, id: string) => data.season.teams.find((t) => t.id === id)?.name ?? id;

/** After a GM series: streaks, rivalry heat, and a press conference when it matters. */
export function storyAfterSeries(state: SeasonState, data: SeasonData, rec: SeriesRecord): void {
  const gm = state.gm!;
  const side = rec.teams[0] === gm.team ? 0 : 1;
  const opp = rec.teams[1 - side]!;
  const won = rec.winner === gm.team;
  const close = Math.min(...rec.score) === Math.floor(rec.bestOf / 2);
  const prevStreak = gm.streak ?? 0;
  gm.streak = won ? Math.max(1, prevStreak + 1) : Math.min(-1, prevStreak - 1);

  const wasRival = isRival(state, opp);
  const heat = Math.min(100, (gm.rivals?.[opp] ?? 0) + 12 + (close ? 8 : 0) + (!won ? 5 : 0));
  gm.rivals = { ...(gm.rivals ?? {}), [opp]: heat };
  if (wasRival) {
    addMorale(state, { refs: [rec.id], why: `Rivalry ${won ? "win" : "loss"}`, deltas: Object.fromEntries(gm.roster.map((id) => [id, won ? 2 : -2])) });
  } else if (heat >= 50) {
    pushInbox(state, {
      date: rec.date,
      kind: "story",
      title: `A rivalry with ${teamName(data, opp)}`,
      body: `Another tight one against ${teamName(data, opp)}. Fans now call it a rivalry: future meetings swing morale more.`,
      refs: [rec.id],
    });
  }

  const s = gm.streak;
  if (Math.abs(s) >= 3 && Math.abs(s) % 2 === 1) {
    pushInbox(state, {
      date: rec.date,
      kind: "story",
      title: s > 0 ? `${s} straight wins` : `${-s} straight losses`,
      body: s > 0 ? "The team is rolling. The pressure's on to keep it going." : "The slide is the talk of the league. Something has to change.",
      refs: [rec.id],
    });
  }

  const big = rec.phase.kind === "major" || rec.phase.kind === "championship" || wasRival || Math.abs(s) >= 3;
  if (big) {
    pushInbox(state, {
      date: rec.date,
      kind: "press",
      title: `Press conference after ${won ? "beating" : "losing to"} ${teamName(data, opp)}`,
      body: "The media want a word. What's the message?",
      refs: [rec.id],
      action: { type: "press", seriesId: rec.id, opponent: opp, won },
      choices: [
        { id: "back", label: "Back the players", hint: "+3 morale for the roster" },
        { id: "humble", label: "Stay humble", hint: "+2 owner trust" },
        { id: "fire", label: `Call out ${teamName(data, opp)}`, hint: "+5 morale for starters, −2 owner trust, rivalry heats up" },
      ],
    });
  }
}

export function answerPress(state: SeasonState, choice: string, opponent: string, refs: string[]): void {
  const gm = state.gm!;
  if (choice === "back") addMorale(state, { refs, why: "Press: backed the players", deltas: Object.fromEntries(gm.roster.map((id) => [id, 3])) });
  if (choice === "humble") gm.trust = Math.min(100, (gm.trust ?? 60) + 2);
  if (choice === "fire") {
    addMorale(state, { refs, why: "Press: fired up", deltas: Object.fromEntries(gm.starters.map((id) => [id, 5])) });
    gm.trust = Math.max(0, (gm.trust ?? 60) - 2);
    gm.rivals = { ...(gm.rivals ?? {}), [opponent]: Math.min(100, (gm.rivals?.[opponent] ?? 0) + 20) };
  }
}
