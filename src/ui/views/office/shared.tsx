// Small pieces shared by the Office sub-tabs.
import { nextStep, type GoalStatus, type PoolPhase, type SeasonState } from "../../../engine";

/** The pool phase of the next step (for prep and scouting). */
export function nextPhase(state: SeasonState): PoolPhase | null {
  if (state.pending) return state.pending.spec.phase;
  const step = nextStep(state);
  if (!step) return null;
  if (step.kind === "week") return { kind: "qualifiers", stage: step.stage, week: step.week };
  if (step.kind === "championship") return { kind: "championship" };
  return { kind: step.kind, stage: step.stage };
}

export const STATUS_COLOR: Record<GoalStatus, string> = {
  met: "var(--pick)",
  "on track": "var(--pick)",
  open: "var(--text-3)",
  "at risk": "var(--ban)",
  failed: "var(--ban)",
};

export function Meter({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <span className="meter" aria-hidden>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: warn ? "var(--ban)" : undefined }} />
    </span>
  );
}

// ------------------------------------------------------------------ the week ahead

export const fmtMod = (x: number) => (Math.abs(x) < 0.005 ? "0" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}`);
