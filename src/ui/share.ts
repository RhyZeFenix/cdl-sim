// Shareable links: the season's settings (and, for Commissioner saves, how far it has
// been simmed) in the URL hash. Opening the link rebuilds the exact same season,
// since everything is deterministic from the seed.
import { SEASON_IDS, type Difficulty, type SeasonId } from "../engine";
import type { SeasonConfig } from "./useSeason";

export interface ShareSpec {
  config: SeasonConfig;
  /** Steps to sim on open (Commissioner only; GM decisions can't be encoded). */
  step: number;
  /** A clip: open this series on this map slot at this game second. */
  clip?: { series: string; slot: number; t: number };
}

export function shareUrl(cfg: SeasonConfig, step: number, clip?: ShareSpec["clip"]): string {
  const p = new URLSearchParams();
  p.set("s", cfg.seasonId);
  p.set("seed", cfg.seed);
  if (cfg.ratingMode !== "historical") p.set("r", cfg.ratingMode);
  if (cfg.gmTeam) p.set("gm", cfg.gmTeam);
  if (cfg.gmTeam && cfg.difficulty && cfg.difficulty !== "normal") p.set("d", cfg.difficulty);
  if (cfg.chaos) p.set("chaos", "1");
  if (cfg.realForm) p.set("form", "real");
  if (cfg.gmTeam && cfg.rules?.draft) p.set("draft", "1");
  if (cfg.gmTeam && cfg.rules?.timeouts) p.set("timeouts", "1");
  if (cfg.champsOnly) p.set("champs", "1");
  if (!cfg.gmTeam && step > 0) p.set("step", String(step));
  if (clip) p.set("clip", `${clip.series}:${clip.slot}:${clip.t}`);
  return `${location.origin}${location.pathname}#${p.toString()}`;
}

export function readShare(hash = location.hash): ShareSpec | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const s = p.get("s") as SeasonId | null;
  const seed = p.get("seed");
  if (!s || !seed || !SEASON_IDS.includes(s)) return null;
  return {
    config: {
      seasonId: s,
      seed,
      ratingMode: p.get("r") === "randomized" ? "randomized" : "historical",
      gmTeam: p.get("gm") ?? undefined,
      difficulty: (p.get("d") as Difficulty | null) ?? undefined,
      chaos: p.get("chaos") === "1",
      realForm: p.get("form") === "real",
      rules: p.get("draft") === "1" || p.get("timeouts") === "1" ? { draft: p.get("draft") === "1", timeouts: p.get("timeouts") === "1" } : undefined,
      champsOnly: p.get("champs") === "1",
    },
    step: Math.max(0, Number(p.get("step") ?? 0) || 0),
    clip: parseClip(p.get("clip")),
  };
}

function parseClip(v: string | null): ShareSpec["clip"] {
  const m = v ? /^(.+):(\d+):(\d+)$/.exec(v) : null;
  return m ? { series: m[1]!, slot: Number(m[2]), t: Number(m[3]) } : undefined;
}
