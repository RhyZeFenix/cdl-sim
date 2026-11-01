// AR/SMG roles. The wiki doesn't record them, so every player starts as flex. Roles
// come from data/roles.json (labels sent in and built into the site) and from labels
// set in this browser, which win. GM mode's role balance uses them.
import builtIn from "../../../data/roles.json";
import type { Player } from "./schema";

type Role = Player["role"];
export type PlayerRole = Role;

const BUILT_IN = (builtIn as { roles: Record<string, Role> }).roles;
let local: Record<string, Role> = {};

/** Labels set in this browser (the UI loads them at startup). */
export function setLocalRoles(roles: Record<string, Role>): void {
  local = { ...roles };
}

/** A player's role, if anyone has labelled it. */
export const labelledRole = (id: string): Role | undefined => local[id] ?? BUILT_IN[id];

/** How many players have a built-in label. */
export const builtInRoleCount = () => Object.keys(BUILT_IN).length;
