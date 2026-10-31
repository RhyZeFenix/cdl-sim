# 3D replay — design notes

Status: built (layouts, timeline, renderer, Watch integration), and every map in the 2024-2026
pools is traced. Open: real bomb site / Control zone / Overload goal positions (none published),
6 Star's hill positions, and the 0:00 SnD plant in the engine.

Goal: watch a map in 3D, driven by the existing `MapResult.events` live feed, inside the
spoiler-free map-by-map flow in `MatchView` (live mode) and the normal Watch panel.

## Facts gathered
- Hill counts/names come from GamesAtlas (`hardpointHills[map].source`). Each map page has a
  minimap and a second minimap with hills numbered in rotation order, e.g.
  `https://www.gamesatlas.com/images/jch-optimize/ng/images_cod-black-ops-7_maps_den-black-ops-7-map-layout-hardpoint.avif`
  (Raid/Scar follow the same URL pattern). No SnD sites, Control zones or Overload goals there.
- CoD Esports Wiki BO7 map pages have no minimaps.
- Use these images only as a tracing reference; never ship them. Mark traced data `approximate`.
- three latest is 0.187.0; use an older pinned version (e.g. 0.181.0) + `@types/three`.

## Event timing (from the engine)
- HP: kills come from `teamFight` (all 8 alive at fight start, so deaths last until the next
  fight); `hold.t` is the END of a hold of `secs`; `hill` event closes hill `n`
  (layout hill index = (n-1) % count).
- SnD: `plant{site}`, `defuse` (t includes defuse time), `round{atk,winner}` at round end + 5s;
  dead players stay dead until the round ends.
- Control: `zone` A = first zone captured, B = second; respawn mode with life pools.
- Overload: `pickup`/`drop` happen at the same t (instant turnover); `ocap`; `half`; `sudden`.

## Plan
1. `src/ui/replay/layouts.ts`: per-map data in 0..100 units: `walls` (rects + height),
   `spawns[2]`, `hills[]`, `sites{A,B}`, `zones{A,B}`, `goals[2]`, `device`. Traced Den, Raid,
   Scar first. A deterministic generic layout (seeded by map name) covers every other map and
   fills in any objective set that's missing.
2. `src/ui/replay/timeline.ts` (pure, testable, no three): rasterize walls to a ~1-unit grid;
   lazily cached BFS flow fields per goal cell for pathing. Tick at 0.5s, 8 agents, ~5 u/s.
   Agents keep "appointments" (be at point P by time t) for plants, defuses, hill `on`
   players, zone caps, ocaps and kills (killer and victim close in during the 4s before),
   speeding up when needed. Respawn 5s after death (not in SnD); reset each round;
   Overload teams swap sides at the half. Output Float32Array positions plus alive flags.
3. `src/ui/replay/Replay3D.tsx`, loaded with `React.lazy`: box walls, team-colored capsules
   with name sprites, hill/site/zone/goal markers with ownership colors, bomb/device, fading
   kill tracers, OrbitControls with a broadcast/overhead toggle.
4. Watch.tsx: switch to clock-based playback (idx = last event with t <= clock), speeds
   1×/4×/16×/64×, with a 3D/Feed toggle above the existing scoreboard and feed.
5. Tests: deterministic timeline; appointment holders are at the objective at event time;
   SnD dead players stay dead.
