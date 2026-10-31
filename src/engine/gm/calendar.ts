// The season calendar: every step with its date, the signing and trade windows (the
// trade deadline is the window before Champs), and the GM team's matches.
import type { SeasonData } from "../data/registry";
import { weekDate, type SeasonState, type Step } from "../season/season";

export interface CalendarRow {
  index: number;
  step: Step;
  date: string;
  status: "done" | "next" | "upcoming";
  /** A window opens before this step: signings always, trades unless it's Champs. */
  window?: { trades: boolean };
  /** The GM team's qualifier matches this week (series ids and opponents). */
  matches: { id: string; opponent: string }[];
}

export function calendar(state: SeasonState, data: SeasonData): CalendarRow[] {
  const { season } = data;
  const gm = state.gm?.team;
  return state.steps.map((step, index) => {
    const date =
      step.kind === "week"
        ? weekDate(season, step.stage, step.week)
        : step.kind === "championship"
          ? season.championship.start
          : season.stages[step.stage - 1]![step.kind]!.start;
    const opensWindow = index === 0 || state.steps[index - 1]!.kind === "major";
    const matches =
      step.kind === "week" && gm
        ? state.schedule[step.stage - 1]![step.week - 1]!.filter((f) => f.teams.includes(gm)).map((f) => ({ id: f.id, opponent: f.teams[0] === gm ? f.teams[1] : f.teams[0] }))
        : [];
    return {
      index,
      step,
      date,
      status: index < state.next ? "done" : index === state.next ? "next" : "upcoming",
      window: opensWindow ? { trades: step.kind !== "championship" } : undefined,
      matches,
    };
  });
}
