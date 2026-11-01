// Player role labels set in this browser (localStorage).
import type { PlayerRole } from "../engine";

const KEY = "cdl-sim:roles";

export function localRoles(): Record<string, PlayerRole> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, PlayerRole>;
  } catch {
    return {};
  }
}

export function saveLocalRoles(roles: Record<string, PlayerRole>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(roles));
  } catch {
    /* blocked storage: labels still apply this session */
  }
}
