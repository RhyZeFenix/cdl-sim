// Difficulty for GM saves: how big the cap is, how hard AI teams bargain, how much the
// owner forgives, and how far morale swings. Sandbox turns off the cap and firing.
import type { SeasonState } from "../season/season";
import { SALARY_CAP } from "./values";

export type Difficulty = "easy" | "normal" | "hard" | "sandbox";

export interface DifficultySettings {
  label: string;
  blurb: string;
  /** $k; Infinity means no cap. */
  cap: number;
  /** How far ahead AI teams must come out in a trade: [any player, their best player]. */
  tradeNeed: [number, number];
  /** Owner trust: multipliers on drops and on gains. */
  trustLoss: number;
  trustGain: number;
  /** Morale drops from results are multiplied by this. */
  moraleLoss: number;
  /** Fired at the end of a season when trust is below this (and goals weren't half met). */
  fireBelow: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultySettings> = {
  easy: { label: "Easy", blurb: "Bigger cap, friendlier trades, a patient owner.", cap: 1350, tradeNeed: [1.0, 1.15], trustLoss: 0.6, trustGain: 1.2, moraleLoss: 0.7, fireBelow: 15 },
  normal: { label: "Normal", blurb: "The default.", cap: SALARY_CAP, tradeNeed: [1.1, 1.3], trustLoss: 1, trustGain: 1, moraleLoss: 1, fireBelow: 30 },
  hard: { label: "Hard", blurb: "Tight cap, tough bargaining, an impatient owner.", cap: 950, tradeNeed: [1.2, 1.45], trustLoss: 1.4, trustGain: 0.8, moraleLoss: 1.3, fireBelow: 40 },
  sandbox: { label: "Sandbox", blurb: "No cap and you can't be fired.", cap: Infinity, tradeNeed: [1.0, 1.1], trustLoss: 0.5, trustGain: 1, moraleLoss: 0.7, fireBelow: -1 },
};

export const difficultyOf = (state: SeasonState): DifficultySettings => DIFFICULTY[state.options.difficulty ?? "normal"];
export const capOf = (state: SeasonState) => difficultyOf(state).cap;
export const capLabel = (state: SeasonState) => (Number.isFinite(capOf(state)) ? `$${capOf(state)}k` : "no cap");
