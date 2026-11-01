// Turns one map's event log into movement for the 3D replay. Nothing here decides
// results: every kill, hold, plant, carry and capture comes from the stored events, and
// the eight players are steered so they are in the right place when each one happens
// (the planter on the site, the hill holders on the hill, the killer near the victim).
// Movement is seeded, so the same map always plays back the same way. No three.js here.
import { createRng, type MapEvent, type MapResult, type Rng, type Side } from "../../engine";
import type { Layout, Pt } from "./layouts";
import { allBlocks } from "./shapes";

export const DT = 0.25;
const SPEED = 5.5; // map units per second, running
const N = 100; // grid cells per axis (1 unit each)
const RESPAWN = 5;
const DEFUSE_SECS = 5;

// ---------------------------------------------------------------- walkable grid

export interface Grid {
  walk: Uint8Array;
  flows: Map<number, Uint16Array>;
}

const inRect = (x: number, y: number, r: readonly number[], pad = 0) =>
  x >= r[0]! - pad && x <= r[2]! + pad && y >= r[1]! - pad && y <= r[3]! + pad;

export function insideBlock(b: Layout["blocks"][number], x: number, y: number, pad = 0): boolean {
  if (!b.rot) return inRect(x, y, b.r, pad);
  const cx = (b.r[0] + b.r[2]) / 2;
  const cy = (b.r[1] + b.r[3]) / 2;
  const a = (-b.rot * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return inRect(cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a), b.r, pad);
}

export function buildGrid(L: Layout): Grid {
  const walk = new Uint8Array(N * N);
  const blocks = allBlocks(L);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = i + 0.5;
      const y = j + 0.5;
      const onFloor = L.floor.some((r) => inRect(x, y, r));
      walk[j * N + i] = onFloor && !blocks.some((b) => insideBlock(b, x, y, 0.5)) ? 1 : 0;
    }
  return { walk, flows: new Map() };
}

const cellOf = (p: Pt) => Math.min(N - 1, Math.max(0, Math.floor(p.y))) * N + Math.min(N - 1, Math.max(0, Math.floor(p.x)));
const center = (c: number): Pt => ({ x: (c % N) + 0.5, y: Math.floor(c / N) + 0.5 });
export const walkable = (g: Grid, p: Pt) => p.x >= 0 && p.y >= 0 && p.x < N && p.y < N && g.walk[cellOf(p)] === 1;

/** The point itself if it's walkable, otherwise the nearest walkable cell centre. */
export function snap(g: Grid, p: Pt): Pt {
  if (walkable(g, p)) return p;
  const c0 = cellOf(p);
  const [i0, j0] = [c0 % N, Math.floor(c0 / N)];
  for (let r = 1; r < 30; r++) {
    let best: Pt | null = null;
    let bd = Infinity;
    for (let j = j0 - r; j <= j0 + r; j++)
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N || !g.walk[j * N + i]) continue;
        const d = (i + 0.5 - p.x) ** 2 + (j + 0.5 - p.y) ** 2;
        if (d < bd) [best, bd] = [center(j * N + i), d];
      }
    if (best) return best;
  }
  return p;
}

export function los(g: Grid, a: Pt, b: Pt): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(d / 0.4);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!walkable(g, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

const FAR = 65535;

/** Breadth-first distances to a goal cell, cached per goal. */
function flow(g: Grid, goal: number): Uint16Array {
  let f = g.flows.get(goal);
  if (f) return f;
  f = new Uint16Array(N * N).fill(FAR);
  const q = new Int32Array(N * N);
  let head = 0;
  let tail = 0;
  f[goal] = 0;
  q[tail++] = goal;
  while (head < tail) {
    const c = q[head++]!;
    const i = c % N;
    const j = Math.floor(c / N);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (!g.walk[n] || f[n] !== FAR) continue;
        // No corner cutting.
        if (di && dj && (!g.walk[j * N + ni] || !g.walk[nj * N + i])) continue;
        f[n] = f[c]! + 1;
        q[tail++] = n;
      }
  }
  g.flows.set(goal, f);
  return f;
}

/** Where to head next on the way to `goal`, and roughly how far it is. */
function route(g: Grid, from: Pt, goal: Pt): { to: Pt; dist: number; grid?: Pt } {
  const straight = Math.hypot(goal.x - from.x, goal.y - from.y);
  if (los(g, from, goal)) return { to: goal, dist: straight };
  const f = flow(g, cellOf(goal));
  let c = cellOf(from);
  if (f[c] === FAR) return { to: goal, dist: straight };
  const dist = f[c]! * 1.15;
  let to = center(c);
  let grid: Pt | undefined;
  for (let k = 0; k < 14 && f[c]! > 0; k++) {
    const i = c % N;
    const j = Math.floor(c / N);
    let next = c;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (di && dj && (!g.walk[j * N + ni] || !g.walk[nj * N + i])) continue;
        if (f[n]! < f[next]!) next = n;
      }
    if (next === c) break;
    c = next;
    const p = center(c);
    grid ??= p;
    if (!los(g, from, p)) break;
    to = p;
  }
  // `grid` is the next cell along the field: a safe step when the smoothed one clips a corner.
  return { to, dist, grid };
}

// ---------------------------------------------------------------- hold spots

const holdCache = new WeakMap<Grid, Map<string, Pt[]>>();

/**
 * Spots worth holding around an objective: open cells next to cover that can see it,
 * plus any power positions the layout lists. Cached per grid and objective.
 */
export function holdSpots(g: Grid, c: Pt, rMin: number, rMax: number, extra: Pt[] = []): Pt[] {
  let cache = holdCache.get(g);
  if (!cache) holdCache.set(g, (cache = new Map()));
  const key = `${c.x.toFixed(1)},${c.y.toFixed(1)},${rMin},${rMax}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: Pt[] = [];
  for (let j = Math.floor(c.y - rMax); j <= c.y + rMax; j++) {
    for (let i = Math.floor(c.x - rMax); i <= c.x + rMax; i++) {
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1 || !g.walk[j * N + i]) continue;
      const p = { x: i + 0.5, y: j + 0.5 };
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < rMin || d > rMax) continue;
      let cover = false;
      for (let dj = -1; dj <= 1 && !cover; dj++) for (let di = -1; di <= 1; di++) if (!g.walk[(j + dj) * N + (i + di)]) cover = true;
      if (cover && los(g, p, c)) out.push(p);
    }
  }
  for (const e of extra) if (Math.hypot(e.x - c.x, e.y - c.y) <= rMax + 4 && walkable(g, e)) out.push(e, e, e);
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- timeline

export interface KillFx {
  t: number;
  by: number;
  on: number;
  from: Pt;
  to: Pt;
}

export interface Timeline {
  layout: Layout;
  grid: Grid;
  frames: number;
  duration: number;
  /** frames × 8 × (x, y). */
  pos: Float32Array;
  /** frames × 8, 1 = alive. */
  alive: Uint8Array;
  /**
   * frames × 4, objective state per mode:
   * hp [hill index, owner side or -1], snd [site 0/A 1/B 2, bomb 0 none/1 planted/2 defused/3 detonated, attacking side],
   * control [zones taken this round, attacking side, zone being attacked 0/1], overload [device x, device y, carrier or -1, sides swapped 0/1].
   */
  obj: Float32Array;
  kills: KillFx[];
}

const sideOf = (i: number): Side => (i < 4 ? 0 : 1);
const sorted = (events: MapEvent[]) => events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
type Ev<K extends MapEvent["k"]> = Extract<MapEvent, { k: K }>;

interface Round {
  start: number;
  end: number;
  /** When play stops (the round event comes 5 s after the round is decided). */
  live: number;
  atk: Side;
  how: Ev<"round">["how"];
  plant?: Ev<"plant">;
  defuse?: Ev<"defuse">;
  zones: Ev<"zone">[];
}

function rounds(events: MapEvent[]): Round[] {
  const out: Round[] = [];
  let start = 0;
  let cur: Omit<Round, "start" | "end" | "live" | "atk" | "how"> = { zones: [] };
  for (const e of events) {
    if (e.k === "plant") cur.plant = e;
    if (e.k === "defuse") cur.defuse = e;
    if (e.k === "zone") cur.zones.push(e);
    if (e.k === "round") {
      out.push({ ...cur, start, end: e.t, live: Math.max(start + 1, e.t - 5), atk: e.atk, how: e.how });
      start = e.t;
      cur = { zones: [] };
    }
  }
  return out;
}

/** Hill index (0-based, into the layout) from a label like "P3 Motel". */
export const hillIndex = (label: string, n: number) => {
  const m = /^P(\d+)/.exec(label);
  return m ? Number(m[1]) - 1 : n - 1;
};

export function buildTimeline(map: MapResult, layout: Layout, seed: string): Timeline {
  const g = buildGrid(layout);
  const rng: Rng = createRng(`replay:${seed}`);
  const ev = sorted(map.events);
  const last = ev.length ? ev[ev.length - 1]!.t : 0;
  const duration = Math.max(last, map.durationSec) + 2;
  const frames = Math.ceil(duration / DT) + 1;
  const pos = new Float32Array(frames * 16);
  const alive = new Uint8Array(frames * 8);
  const obj = new Float32Array(frames * 4);
  const kills: KillFx[] = [];
  const mode = map.mode;
  const S = (p: Pt) => snap(g, p);

  // ---- precomputed structure from the events
  const kEv = ev.filter((e): e is Ev<"kill"> => e.k === "kill");
  const rs = mode === "snd" || mode === "control" ? rounds(ev) : [];
  const roundAt = (t: number) => rs.find((r) => t < r.end) ?? rs[rs.length - 1];

  // Hardpoint: each hill's time window, and the holds within it.
  const hillSegs: { start: number; end: number; idx: number }[] = [];
  const holds: { start: number; end: number; team: Side; on: number[] }[] = [];
  if (mode === "hp") {
    let start = 0;
    for (const e of ev) {
      if (e.k === "hill") {
        hillSegs.push({ start, end: e.t, idx: hillIndex(e.label, e.n) % layout.hills.length });
        start = e.t;
      }
      if (e.k === "hold") holds.push({ start: e.t - e.secs, end: e.t, team: e.team, on: e.on });
    }
  }
  const hillAt = (t: number) => hillSegs.find((h) => t < h.end) ?? hillSegs[hillSegs.length - 1];

  // Overload: halves (sides swap at the half) and each carry and how it ended.
  const halfEnds = ev.filter((e) => e.k === "half").map((e) => e.t);
  const swappedAt = (t: number) => (halfEnds.length && t >= halfEnds[0]! ? 1 : 0);
  const carries: { start: number; end: number; by: number; scored: boolean }[] = [];
  if (mode === "overload") {
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]!;
      if (e.k !== "pickup") continue;
      const endE = ev.slice(i + 1).find((x) => ((x.k === "drop" || x.k === "ocap") && x.by === e.by) || x.k === "half" || x.k === "sudden");
      carries.push({ start: e.t, end: endE?.t ?? duration, by: e.by, scored: endE?.k === "ocap" });
    }
  }
  const carryAt = (t: number) => carries.find((c) => t >= c.start && t < c.end);

  // When each player is next needed (kills, holds, plants, carries) so respawns don't miss them.
  const needs: number[][] = Array.from({ length: 8 }, () => []);
  for (const e of ev) {
    if (e.k === "kill") needs[e.by]!.push(e.t), needs[e.on]!.push(e.t);
    if (e.k === "pickup" || e.k === "zone" || e.k === "plant" || e.k === "ocap") needs[e.by]!.push(e.t);
  }
  for (const h of holds) for (const p of h.on) needs[p]!.push(h.start);
  const nextNeed = (p: number, after: number) => needs[p]!.find((t) => t > after) ?? Infinity;

  // ---- agent state
  const x = new Float64Array(8);
  const y = new Float64Array(8);
  const up = new Uint8Array(8).fill(1);
  const respawnAt = new Float64Array(8).fill(Infinity);
  const wander = Array.from({ length: 8 }, () => ({ a: 0, r: 0, until: -1 }));
  const at = (p: number): Pt => ({ x: x[p]!, y: y[p]! });

  const spawnSide = (side: Side, t: number): Side => (mode === "overload" && swappedAt(t) ? ((1 - side) as Side) : side);
  const place = (p: number, base: Pt, k: number) => {
    const q = S({ x: base.x + ((k % 3) - 1) * 2.2, y: base.y + (Math.floor(k / 3) - 0.5) * 2.2 });
    x[p] = q.x;
    y[p] = q.y;
  };
  const roundBase = (p: number, r: Round) => {
    const L = mode === "snd" ? layout.snd : layout.control;
    return sideOf(p) === r.atk ? L.atk : L.def;
  };
  const respawn = (p: number, t: number) => {
    let base: Pt;
    if (mode === "hp") {
      // Hardpoint spawns flip: come back at the spawn point furthest from the enemy.
      const enemies = [0, 1, 2, 3, 4, 5, 6, 7].filter((q) => sideOf(q) !== sideOf(p) && up[q]);
      const cx = enemies.reduce((s, q) => s + x[q]!, 0) / Math.max(1, enemies.length) || 50;
      const cy = enemies.reduce((s, q) => s + y[q]!, 0) / Math.max(1, enemies.length) || 50;
      const all = [...layout.spawns[0], ...layout.spawns[1]];
      base = all.map((s) => ({ s, d: Math.hypot(s.x - cx, s.y - cy) + rng.next() * 12 })).sort((a, b) => b.d - a.d)[0]!.s;
    } else if (mode === "control") {
      base = roundBase(p, roundAt(t)!);
    } else {
      base = layout.spawns[spawnSide(sideOf(p), t)][p % 3]!;
    }
    place(p, base, p % 4);
    up[p] = 1;
    respawnAt[p] = Infinity;
  };

  // Starting positions.
  for (let p = 0; p < 8; p++) {
    if (rs.length) place(p, roundBase(p, rs[0]!), p % 4);
    else place(p, layout.spawns[spawnSide(sideOf(p), 0)][p % 3]!, p % 4);
  }

  /** A point near `c`, spread out per player, biased toward `toward`, re-rolled every few seconds. */
  const around = (p: number, c: Pt, rMin: number, rMax: number, t: number, toward?: Pt): Pt => {
    const w = wander[p]!;
    // Most of the time players hold a spot behind cover that sees the objective.
    if (t >= w.until && rMax > 6 && rng.next() < 0.6) {
      const spots = holdSpots(g, c, rMin, rMax, layout.holds);
      const facing = toward ? spots.filter((q) => (q.x - c.x) * (toward.x - c.x) + (q.y - c.y) * (toward.y - c.y) > 0) : spots;
      const pool = facing.length ? facing : spots;
      if (pool.length) {
        const q = pool[Math.floor(rng.next() * pool.length)]!;
        w.a = Math.atan2(q.y - c.y, q.x - c.x);
        w.r = Math.hypot(q.x - c.x, q.y - c.y);
        w.until = t + 6 + rng.next() * 8;
      }
    }
    if (t >= w.until) {
      const bias = toward ? Math.atan2(toward.y - c.y, toward.x - c.x) : rng.next() * Math.PI * 2;
      w.a = bias + (rng.next() - 0.5) * (toward ? 2.4 : Math.PI * 2);
      w.r = rMin + rng.next() * (rMax - rMin);
      w.until = t + 5 + rng.next() * 6;
    }
    return S({ x: c.x + Math.cos(w.a) * w.r, y: c.y + Math.sin(w.a) * w.r });
  };
  const centroid = (s: Side): Pt => {
    const ps = [0, 1, 2, 3].map((k) => k + s * 4).filter((q) => up[q]);
    if (!ps.length) return layout.spawns[s][1] ?? { x: 50, y: 50 };
    return { x: ps.reduce((a, q) => a + x[q]!, 0) / ps.length, y: ps.reduce((a, q) => a + y[q]!, 0) / ps.length };
  };

  // Overload device position when nobody carries it.
  let device: Pt = layout.overload.device;
  let ei = 0;
  let ki = 0;
  let curRound = -1;

  for (let f = 0; f < frames; f++) {
    const t = f * DT;

    // Rounds: everyone back to spawn, alive, at the start of each round.
    if (rs.length) {
      const ri = rs.findIndex((r) => t < r.end);
      if (ri !== -1 && ri !== curRound) {
        curRound = ri;
        for (let p = 0; p < 8; p++) {
          up[p] = 1;
          respawnAt[p] = Infinity;
          wander[p]!.until = -1;
          place(p, roundBase(p, rs[ri]!), p % 4);
        }
      }
    }

    // Apply events up to now.
    while (ei < ev.length && ev[ei]!.t <= t) {
      const e = ev[ei++]!;
      if (e.k === "kill") {
        kills.push({ t: e.t, by: e.by, on: e.on, from: at(e.by), to: at(e.on) });
        up[e.on] = 0;
        if (mode !== "snd") {
          // Back in time for the next thing this player is needed for.
          respawnAt[e.on] = Math.max(e.t + 0.75, Math.min(e.t + RESPAWN, nextNeed(e.on, e.t) - 3));
        }
      }
      if (e.k === "drop") device = at(e.by);
      if (e.k === "ocap" || e.k === "half" || e.k === "sudden") device = layout.overload.device;
    }
    while (ki < kEv.length && kEv[ki]!.t <= t) ki++;
    for (let p = 0; p < 8; p++) if (!up[p] && t >= respawnAt[p]!) respawn(p, t);

    // Goals for this tick.
    const goal: (Pt | null)[] = new Array(8).fill(null);
    const due: number[] = new Array(8).fill(Infinity);

    // Upcoming kills: killer and victim close in on each other over the last few seconds.
    for (let k = ki; k < kEv.length && kEv[k]!.t <= t + 3; k++) {
      const e = kEv[k]!;
      for (const [me, them] of [
        [e.by, e.on],
        [e.on, e.by],
      ] as const) {
        if (goal[me] || !up[me]) continue;
        const d = Math.hypot(x[them]! - x[me]!, y[them]! - y[me]!);
        goal[me] = d < 9 && los(g, at(me), at(them)) ? at(me) : at(them);
        due[me] = e.t;
      }
    }

    const objState = [0, 0, 0, 0];
    if (mode === "hp" && hillSegs.length) {
      const seg = hillAt(t)!;
      const h = layout.hills[seg.idx]!;
      const hold = holds.find((o) => t >= o.start && t <= o.end);
      objState[0] = seg.idx;
      objState[1] = hold ? hold.team : -1;
      const soon = holds.find((o) => o.end >= t && o.start <= t + 3 && o.start >= seg.start);
      for (let p = 0; p < 8; p++) {
        const holder = soon?.on.includes(p);
        if (holder) {
          // Holders stand on the hill (they take priority over a fight further out).
          goal[p] = around(p, h, 0, Math.min(h.w, h.d) * 0.35, t);
          due[p] = soon!.start;
        } else if (!goal[p]) {
          goal[p] = around(p, h, 6, 15, t, layout.spawns[sideOf(p)][1]);
        }
      }
    } else if (mode === "snd" && rs.length) {
      const r = roundAt(t)!;
      const site = r.plant?.site ?? (rng.fork(`site${r.start}`).chance(0.5) ? "A" : "B");
      const sitePt = layout.snd[site];
      const planted = !!r.plant && t >= r.plant.t;
      const defused = !!r.defuse && t >= r.defuse.t;
      objState[0] = r.plant && planted ? (site === "A" ? 1 : 2) : 0;
      objState[1] = !planted ? 0 : defused ? 2 : r.how === "detonate" && t >= r.live ? 3 : 1;
      objState[2] = r.atk;
      for (let p = 0; p < 8; p++) {
        const atk = sideOf(p) === r.atk;
        if (r.plant && r.plant.by === p && !planted) {
          goal[p] = sitePt;
          due[p] = r.plant.t;
        } else if (r.defuse && r.defuse.by === p && t < r.defuse.t) {
          goal[p] = sitePt;
          due[p] = r.defuse.t - DEFUSE_SECS;
        } else if (goal[p]) continue;
        else if (atk) {
          // Attackers walk up, then take positions around the site.
          const elapsed = t - r.start;
          goal[p] = elapsed < 12 && !planted ? around(p, sitePt, 14, 22, t, layout.snd.atk) : around(p, sitePt, 3, 11, t);
        } else {
          const home = planted ? sitePt : p % 2 ? layout.snd.A : layout.snd.B;
          goal[p] = around(p, home, planted ? 6 : 2, planted ? 14 : 9, t, planted ? layout.snd.def : layout.snd.atk);
        }
      }
    } else if (mode === "control" && rs.length) {
      const r = roundAt(t)!;
      const taken = r.zones.filter((z) => z.t <= t).length;
      const target = taken === 0 ? layout.control.A : layout.control.B;
      objState[0] = taken;
      objState[1] = r.atk;
      objState[2] = taken === 0 ? 0 : 1;
      const nextZone = r.zones.find((z) => z.t > t);
      for (let p = 0; p < 8; p++) {
        if (nextZone && nextZone.by === p && nextZone.t - t < 6) {
          goal[p] = target;
          due[p] = nextZone.t;
        } else if (goal[p]) continue;
        else if (sideOf(p) === r.atk) goal[p] = around(p, target, 3, 12, t, layout.control.atk);
        else goal[p] = around(p, taken ? target : p % 2 ? layout.control.A : layout.control.B, 3, 10, t, layout.control.def);
      }
    } else if (mode === "overload") {
      const c = carryAt(t);
      const sw = swappedAt(t);
      const devPt = c && up[c.by] ? at(c.by) : device;
      objState[0] = devPt.x;
      objState[1] = devPt.y;
      objState[2] = c ? c.by : -1;
      objState[3] = sw;
      const upcoming = carries.find((k) => k.start > t && k.start <= t + 4);
      for (let p = 0; p < 8; p++) {
        const s = sideOf(p);
        // Each team attacks the goal at the far end from where it spawns.
        const attackGoal = layout.overload.goals[(1 - spawnSide(s, t)) as Side];
        if (c && c.by === p) {
          goal[p] = attackGoal;
          due[p] = c.scored ? c.end : t + 30;
        } else if (upcoming && upcoming.by === p) {
          goal[p] = devPt;
          due[p] = upcoming.start;
        } else if (goal[p]) continue;
        else if (!c) goal[p] = around(p, devPt, 2, 9, t, centroid(s));
        else if (sideOf(c.by) === s) goal[p] = around(p, devPt, 3, 8, t, attackGoal);
        else goal[p] = around(p, devPt, 5, 12, t, attackGoal);
      }
    }

    // Round over: freeze in place for the post-round pause.
    const frozen = rs.length > 0 && t >= roundAt(t)!.live;

    // Move.
    for (let p = 0; p < 8; p++) {
      if (!up[p] || frozen || !goal[p]) continue;
      const me = at(p);
      const gl = S(goal[p]!);
      const r = route(g, me, gl);
      const { dist } = r;
      let to = r.to;
      const left = due[p]! - t;
      let speed = SPEED * 0.85;
      if (Number.isFinite(left)) speed = Math.min(SPEED * 2.4, Math.max(SPEED * 0.7, dist / Math.max(0.3, left)));
      const stepTo = (q: Pt) => {
        const step = Math.min(speed * DT, Math.hypot(q.x - me.x, q.y - me.y));
        if (step < 0.05) return q !== to || !r.grid;
        const a = Math.atan2(q.y - me.y, q.x - me.x);
        const n = { x: me.x + Math.cos(a) * step, y: me.y + Math.sin(a) * step };
        if (!walkable(g, n) || !los(g, me, n)) return false;
        x[p] = n.x;
        y[p] = n.y;
        return true;
      };
      if (!stepTo(to) && r.grid) {
        to = r.grid;
        stepTo(to);
      }
    }

    for (let p = 0; p < 8; p++) {
      pos[(f * 8 + p) * 2] = x[p]!;
      pos[(f * 8 + p) * 2 + 1] = y[p]!;
      alive[f * 8 + p] = up[p]!;
    }
    obj.set(objState, f * 4);
  }

  return { layout, grid: g, frames, duration, pos, alive, obj, kills };
}

/** Interpolated position of a player at time t. */
export function positionAt(tl: Timeline, p: number, t: number): Pt & { alive: boolean } {
  const fx = Math.max(0, Math.min(tl.frames - 1, t / DT));
  const f0 = Math.floor(fx);
  const f1 = Math.min(tl.frames - 1, f0 + 1);
  const u = fx - f0;
  const a0 = tl.alive[f0 * 8 + p] === 1;
  const a1 = tl.alive[f1 * 8 + p] === 1;
  const x0 = tl.pos[(f0 * 8 + p) * 2]!;
  const y0 = tl.pos[(f0 * 8 + p) * 2 + 1]!;
  // Don't slide across the map when respawning.
  if (a0 !== a1 || Math.hypot(tl.pos[(f1 * 8 + p) * 2]! - x0, tl.pos[(f1 * 8 + p) * 2 + 1]! - y0) > 4) return { x: x0, y: y0, alive: a0 };
  return {
    x: x0 + (tl.pos[(f1 * 8 + p) * 2]! - x0) * u,
    y: y0 + (tl.pos[(f1 * 8 + p) * 2 + 1]! - y0) * u,
    alive: a0,
  };
}

export function objAt(tl: Timeline, t: number): number[] {
  const f = Math.max(0, Math.min(tl.frames - 1, Math.floor(t / DT)));
  return Array.from(tl.obj.subarray(f * 4, f * 4 + 4));
}
