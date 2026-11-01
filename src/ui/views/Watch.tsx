// Live playback of one map on the game clock: scoreboard, kill feed and the
// play-by-play lines revealed as their closing event is reached, with an optional 3D
// view of the same moment. Nothing after the clock is ever shown.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { commentary, highlights, mapLogEntries, roundStrip, scoreFromEvents, type MapResult } from "../../engine";
import { hillLabelsOf, timelineFor } from "../replay/build";
import { Replay2D } from "../replay/Replay2D";

const Replay3D = lazy(() => import("../replay/Replay3D"));

type View = "3d" | "2d" | "feed";

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

const HOW: Record<string, string> = { elim: "by elimination", detonate: "on the detonation", defuse: "on the defuse", time: "on time", capture: "on the capture", lives: "on lives" };
const HOW_ICON: Record<string, string> = { elim: "☠", detonate: "💥", defuse: "✂", time: "⏱", capture: "⚑", lives: "♥" };

const VIEW_KEY = "cdl-sim:watch-view";
const savedView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "feed" || v === "2d" ? v : "3d";
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
  startAt,
  clipLink,
}: {
  map: MapResult;
  teams: [string, string];
  players: string[];
  autoPlay: boolean;
  /** Called once when playback reaches the end of the map. */
  onFinished?: () => void;
  /** Seeds the 3D movement so a map always plays back the same way. */
  seed?: string;
  /** Open at this game time (a clip link), paused. */
  startAt?: number;
  /** Builds a shareable link to a moment of this map, when the season can be shared. */
  clipLink?: (t: number) => string;
}) {
  const [view, setViewState] = useState<View>(savedView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(view === "feed" ? 2 : 1);
  const n = map.events.length;
  const end = n ? map.events[n - 1]!.t : 0;
  const log = useMemo(() => mapLogEntries(map, { team: teams, player: players }), [map, teams, players]);
  const hl = useMemo(() => highlights(map, players, teams), [map, players, teams]);
  const captions = useMemo(() => commentary(map, players, teams), [map, players, teams]);
  const [showCaptions, setShowCaptions] = useState(true);
  // Highlight reel: which highlight is playing, and who the camera follows.
  const [reel, setReel] = useState<number | null>(null);
  const [follow, setFollow] = useState<number | undefined>(undefined);
  const playHighlight = (i: number, auto: boolean) => {
    const h = hl[i]!;
    setReel(auto ? i : null);
    setNow(h.from);
    setSpeed(0);
    setFollow(h.by);
    setPlaying(true);
  };

  useEffect(() => {
    setNow(startAt ?? 0);
    setPlaying(startAt === undefined ? autoPlay : false);
    setReel(null);
    setFollow(undefined);
  }, [map, autoPlay, startAt]);
  const rounds = useMemo(() => (map.mode === "snd" || map.mode === "control" ? roundStrip(map) : []), [map]);
  const [copied, setCopied] = useState(false);
  const copyClip = async () => {
    if (!clipLink) return;
    try {
      await navigator.clipboard.writeText(clipLink(Math.floor(now)));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", clipLink(Math.floor(now)));
    }
  };

  // The reel moves on two seconds after each moment.
  useEffect(() => {
    if (reel === null) return;
    const h = hl[reel];
    if (!h || now < h.t + 2) return;
    if (reel + 1 < hl.length) playHighlight(reel + 1, true);
    else {
      setReel(null);
      setPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, reel]);

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
  // The latest caster line, for a few game seconds.
  const caption = showCaptions ? [...captions].reverse().find((c) => c.t <= now && now - c.t < 6) : undefined;
  // Only moments already reached are listed (no spoilers), unless the map is over.
  const shownHl = hl.map((h, i) => ({ h, i })).filter(({ h }) => finished || h.t <= now);
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
        <button className="btn" onClick={() => (setNow(end), setPlaying(false), setReel(null))}>
          End
        </button>
        <button
          className="btn"
          disabled={!hl.length}
          aria-pressed={reel !== null}
          onClick={() => (reel !== null ? (setReel(null), setPlaying(false)) : playHighlight(0, true))}
          title="Play the best moments back to back, following the player"
        >
          {reel !== null ? `Reel ${reel + 1}/${hl.length} ■` : "Highlight reel"}
        </button>
        <label className="row sub" style={{ gap: 4 }}>
          <input type="checkbox" checked={showCaptions} onChange={(e) => setShowCaptions(e.target.checked)} style={{ width: "auto" }} />
          Commentary
        </label>
        {clipLink && (
          <button className="btn small" onClick={copyClip} title="Copy a link that opens this map at this moment">
            {copied ? "Link copied" : "Share this moment"}
          </button>
        )}
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
          <button aria-pressed={view === "2d"} onClick={() => setView("2d")} title="Top-down minimap view">
            2D
          </button>
          <button aria-pressed={view === "feed"} onClick={() => setView("feed")}>
            Feed only
          </button>
        </div>
      </div>
      <input type="range" min={0} max={end} step={0.5} value={now} onChange={(e) => (setNow(Number(e.target.value)), setPlaying(false))} aria-label="Scrub" />
      {rounds.length > 0 && (
        <div className="round-strip" role="list" aria-label="Rounds">
          {rounds
            .filter((r) => finished || r.t <= now)
            .map((r) => (
              <button
                key={r.n}
                role="listitem"
                className={`round-chip s${r.winner}${now >= r.from && now < r.t ? " on" : ""}`}
                onClick={() => (setNow(r.from), setPlaying(true), setReel(null))}
                title={`Round ${r.n}: ${teams[r.winner]} ${HOW[r.how]}${r.site ? ` · planted ${r.site}` : ""}${r.clutch ? ` · ${players[r.clutch.by] ?? ""} clutch 1v${r.clutch.vs}` : ""} · ${r.score[0]}–${r.score[1]}`}
              >
                <b>{r.n}</b>
                <span>{HOW_ICON[r.how]}</span>
                {r.clutch && <span title="Clutch">★</span>}
              </button>
            ))}
        </div>
      )}
      {shownHl.length > 0 && (
        <div className="hl-strip" role="list" aria-label="Highlights">
          {shownHl.map(({ h, i }) => (
            <button key={i} role="listitem" className={`hl-chip ${h.kind}${reel === i ? " on" : ""}`} onClick={() => playHighlight(i, false)} title={`Jump to ${clock(h.from)}`}>
              <span className="muted">{clock(h.t)}</span> {h.title}
            </button>
          ))}
        </div>
      )}
      <div className="watch-stage">
        {view === "2d" && <TopDown map={map} time={now} players={players} seed={seed ?? `${map.map}:${map.slot}`} />}
        {view === "3d" && (
          <Suspense fallback={<div className="replay-msg">Loading 3D…</div>}>
            <Replay3D map={map} time={now} teams={teams} players={players} seed={seed ?? `${map.map}:${map.slot}`} follow={follow} />
          </Suspense>
        )}
        {caption && (
          <div className={`caption${view === "feed" ? " inline" : ""}`} aria-live="polite">
            {caption.text}
          </div>
        )}
      </div>
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

/** The 2D top-down replay with its own timeline. */
function TopDown({ map, time, players, seed }: { map: MapResult; time: number; players: string[]; seed: string }) {
  const tl = useMemo(() => timelineFor(map, seed), [map, seed]);
  const labels = useMemo(() => hillLabelsOf(map, tl.layout.hills.length), [map, tl]);
  return (
    <div className="replay replay-2d">
      <Replay2D tl={tl} map={map} time={time} players={players} hillLabels={labels} />
    </div>
  );
}
