// Staff: a head coach and an analyst, hired from a seeded pool each season and paid
// from a separate staff budget. The coach scales prep bonuses and softens morale
// drops; the analyst sharpens scouting and adds a little game-plan edge.
import { createRng } from "../rng";
import { gmCanMakeMoves, type SeasonState } from "../season/season";
import { academyPayroll } from "./academy";
import { pushInbox } from "./inbox";
import { staffBudget } from "./sponsors";
import { personName } from "./names";
import type { StaffMember } from "./types";

export const STAFF_BUDGET = 200;

/** Prep bonuses times this: 0.7 for a one-star coach up to 1.3 for five stars. */
export const coachFactor = (state: SeasonState) => 1 + 0.15 * ((state.gm?.staff?.coach?.rating ?? 2) - 3);
/** Morale losses times this (a better coach keeps heads up). */
export const coachMoraleShield = (state: SeasonState) => 1 - 0.1 * ((state.gm?.staff?.coach?.rating ?? 2) - 1);
/** 0 without an analyst, else their stars. */
export const analystLevel = (state: SeasonState) => state.gm?.staff?.analyst?.rating ?? 0;
/** Game-plan edge from the analyst on every map. */
export const analystForm = (state: SeasonState) => Math.max(0, analystLevel(state) - 1) * 0.003;

const salaryFor = (rating: number) => [0, 20, 35, 55, 80, 110][rating]!;

/** The staff on the market this season (six coaches and six analysts). */
export function staffPool(state: SeasonState): StaffMember[] {
  const rng = createRng(`${state.options.seed}/staff/${state.dynasty?.year ?? 1}`);
  const out: StaffMember[] = [];
  for (const role of ["coach", "analyst"] as const) {
    for (let i = 0; i < 6; i++) {
      const rating = [1, 2, 2, 3, 4, 5][i]!;
      out.push({ id: `${role}-${i}`, name: personName(rng), role, rating, salary: salaryFor(rating) + rng.int(-1, 2) * 5 });
    }
  }
  const hired = new Set([state.gm?.staff?.coach?.id, state.gm?.staff?.analyst?.id]);
  return out.filter((m) => !hired.has(m.id));
}

export const staffPayroll = (state: SeasonState) => (state.gm?.staff?.coach?.salary ?? 0) + (state.gm?.staff?.analyst?.salary ?? 0);

/** A new GM season starts with a two-star coach and no analyst. */
export function initialStaff(state: SeasonState): NonNullable<NonNullable<SeasonState["gm"]>["staff"]> {
  const coach = staffPool(state).find((m) => m.role === "coach" && m.rating === 2)!;
  return { coach };
}

export function gmHire(state: SeasonState, id: string): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!gmCanMakeMoves(state)) throw new Error("Staff changes happen before the season and between stages.");
  const m = staffPool(state).find((x) => x.id === id);
  if (!m) throw new Error("That person isn't available.");
  const current = gm.staff?.[m.role];
  const after = staffPayroll(state) - (current?.salary ?? 0) + m.salary;
  if (after + academyPayroll(state) > staffBudget(state)) throw new Error(`Over the $${staffBudget(state)}k staff budget ($${after + academyPayroll(state)}k with the academy).`);
  gm.staff = { ...(gm.staff ?? {}), [m.role]: m };
  pushInbox(state, {
    date: "",
    kind: "staff",
    title: `${m.name} hired as ${m.role}`,
    body: `${"★".repeat(m.rating)}${"☆".repeat(5 - m.rating)} ${m.role} at $${m.salary}k.${current ? ` ${current.name} moves on.` : ""}`,
  });
}

export function gmFire(state: SeasonState, role: "coach" | "analyst"): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!gmCanMakeMoves(state)) throw new Error("Staff changes happen before the season and between stages.");
  const staff = { ...(gm.staff ?? {}) };
  delete staff[role];
  gm.staff = staff;
}

export const stars = (n: number) => `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
