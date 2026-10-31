// Live playback of one map on the game clock: scoreboard, kill feed and the
// play-by-play lines revealed as their closing event is reached, with an optional 3D
// view of the same moment. Nothing after the clock is ever shown.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { mapLogEntries, scoreFromEvents, type MapResult } from "../../engine";

const Replay3D = lazy(() => import("../replay/Replay3D"));

/** Game seconds per real second. */
const SPEEDS = [
  { label: "1×", x: 1 },
  { label: "4×", x: 4 },
  { label: "16×", x: 16 },
  { label: "64×", x: 64 },
];

const clock = (t: number) => {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const VIEW_KEY = "cdl-sim:watch-view";
const savedView = (): "3d" | "feed" => {
  try {
    return localStorage.getItem(VIEW_KEY) === "feed" ? "feed" : "3d";
  } catch {
    return "3d";
  }
};

/** Index of the last event at or before time t (-1 if none yet). */
function lastAt(events: MapResult["events"], t: number) {
  let lo = 0;
  let hi = events.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function Watch({
  map,
  teams,
  players,
  autoPlay,
  onFinished,
  seed,
}: {
  map: MapResult;
  teams: [string, string];
  players: string[];
  autoPlay: boolean;
  /** Called once when playback reaches the end of the map. */
  onFinished?: () => void;
  /** Seeds the 3D movement so a map always plays back the same way. */
  seed?: string;
}) {
  const [view, setViewState] = useState<"3d" | "feed">(savedView);
  const setView = (v: "3d" | "feed") => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(view === "3d" ? 1 : 2);
  const n = map.events.length;
  const end = n ? map.events[n - 1]!.t : 0;
  const log = useMemo(() => mapLogEntries(map, { team: teams, player: players }), [map, teams, players]);

  useEffect(() => {
    setNow(0);
    setPlaying(autoPlay);
  }, [map, autoPlay]);

  // The clock runs on animation frames so the 3D view moves smoothly.
  const speedRef = useRef(SPEEDS[speed]!.x);
  speedRef.current = SPEEDS[speed]!.x;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (ms: number) => {
      const dt = Math.min(0.25, (ms - last) / 1000);
      last = ms;
      let stop = false;
      setNow((c) => {
        const next = c + dt * speedRef.current;
        if (next >= end) {
          stop = true;
          return end;
        }
        return next;
      });
      if (stop) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, end]);

  const idx = lastAt(map.events, now);
  const seen = map.events.slice(0, idx + 1);
  const score = scoreFromEvents(map.mode, seen);
  const t = now;
  const feed = seen.slice(-8).reverse();
  const lines = log.filter((l) => l.i <= idx).reverse();
  const finished = now >= end;
  useEffect(() => {
    if (finished) onFinished?.();
    // Only when playback first reaches the end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const describe = (e: MapResult["events"][number]) => {
    const P = (i: number) => players[i] ?? `#${i}`;
    const side = (i: number) => (i < 4 ? 0 : 1);
    switch (e.k) {
      case "kill":
        return (
          <>
            <span className={`k${side(e.by)}`}>{P(e.by)}</span> ✕ {P(e.on)}
            {e.fb ? " · first blood" : ""}
          </>
        );
      case "hold":
        return `${teams[e.team]} hold for ${e.secs}s`;
      case "hill":
        return `— Hill ${e.n} done (${e.label}) —`;
      case "plant":
        return `${P(e.by)} plants ${e.site}`;
      case "defuse":
        return `${P(e.by)} defuses`;
      case "clutch":
        return `${P(e.by)} clutches a 1v${e.vs}`;
      case "zone":
        return `${teams[e.team]} capture ${e.zone} (${P(e.by)})`;
      case "pickup":
        return `${P(e.by)} has the device`;
      case "drop":
        return `${P(e.by)} drops the device`;
      case "ocap":
        return `${P(e.by)} SCORES for ${teams[e.team]}`;
      case "half":
        return `— End of half ${e.n} —`;
      case "sudden":
        return "— Sudden death —";
      case "round":
        return `— Round ${e.n} to ${teams[e.winner]} —`;
    }
  };

  return (
    <div className="watch">
      <div className="scoreboard">
        <div style={{ fontWeight: 700 }}>{teams[0]}</div>
        <div>
          <div className="live">
            {score[0]} – {score[1]}
          </div>
          <div className="clock">
            {map.map} {map.mode.toUpperCase()} · {clock(t)}
            {finished ? " · FINAL" : ""}
          </div>
        </div>
        <div style={{ fontWeight: 700, textAlign: "right" }}>{teams[1]}</div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => (finished ? (setNow(0), setPlaying(true)) : setPlaying(!playing))}>
          {finished ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button
          className="btn"
          onClick={() => setNow(map.events[Math.min(n - 1, log.find((l) => l.i > idx)?.i ?? n - 1)]?.t ?? end)}
          title="Jump to the next hill / round / capture"
        >
          Next beat ›
        </button>
        <button className="btn" onClick={() => (setNow(end), setPlaying(false))}>
          End
        </button>
        <div className="seg" role="group" aria-label="Playback speed">
          {SPEEDS.map((s, i) => (
            <button key={s.label} aria-pressed={speed === i} onClick={() => setSpeed(i)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === "3d"} onClick={() => setView("3d")}>
            3D
          </button>
          <button aria-pressed={view === "feed"} onClick={() => setView("feed")}>
            Feed only
          </button>
        </div>
      </div>
      <input type="range" min={0} max={end} step={0.5} value={now} onChange={(e) => (setNow(Number(e.target.value)), setPlaying(false))} aria-label="Scrub" />
      {view === "3d" && (
        <Suspense fallback={<div className="replay-msg">Loading 3D…</div>}>
          <Replay3D map={map} time={now} teams={teams} players={players} seed={seed ?? `${map.map}:${map.slot}`} />
        </Suspense>
      )}
      <div className="grid2">
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Live feed</h3>
          <div className="feed">
            {feed.map((e, i) => (
              <div key={idx - i}>
                <span className="muted">{clock(e.t)}</span> {describe(e)}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Play-by-play</h3>
          <div className="log">
            {lines.length ? lines.map((l) => <div key={l.i}>{l.text}</div>) : <div className="muted">Waiting for the first {map.mode === "hp" ? "hill" : map.mode === "overload" ? "capture" : "round"}…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
