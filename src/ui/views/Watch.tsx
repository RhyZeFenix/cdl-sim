// Live playback of one map: steps through its events with a scoreboard, kill feed and
// the play-by-play lines revealed as their closing event is reached.
import { useEffect, useMemo, useState } from "react";
import { mapLogEntries, scoreFromEvents, type MapResult } from "../../engine";

const SPEEDS = [
  { label: "1×", eps: 4 },
  { label: "4×", eps: 16 },
  { label: "16×", eps: 64 },
];

const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

export function Watch({ map, teams, players, autoPlay }: { map: MapResult; teams: [string, string]; players: string[]; autoPlay: boolean }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(1);
  const n = map.events.length;
  const log = useMemo(() => mapLogEntries(map, { team: teams, player: players }), [map, teams, players]);

  useEffect(() => {
    setIdx(0);
    setPlaying(autoPlay);
  }, [map, autoPlay]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i >= n - 1) {
          setPlaying(false);
          return n - 1;
        }
        return i + 1;
      });
    }, 1000 / SPEEDS[speed]!.eps);
    return () => clearInterval(id);
  }, [playing, speed, n]);

  const seen = map.events.slice(0, idx + 1);
  const score = scoreFromEvents(map.mode, seen);
  const t = map.events[idx]?.t ?? 0;
  const feed = seen.slice(-8).reverse();
  const lines = log.filter((l) => l.i <= idx).reverse();
  const finished = idx >= n - 1;

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
        <button className="btn primary" onClick={() => (finished ? (setIdx(0), setPlaying(true)) : setPlaying(!playing))}>
          {finished ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button className="btn" onClick={() => setIdx(Math.min(n - 1, (log.find((l) => l.i > idx)?.i ?? n - 1)))} title="Jump to the next hill / round / capture">
          Next beat ›
        </button>
        <button className="btn" onClick={() => (setIdx(n - 1), setPlaying(false))}>
          End
        </button>
        <div className="seg" role="group" aria-label="Playback speed">
          {SPEEDS.map((s, i) => (
            <button key={s.label} aria-pressed={speed === i} onClick={() => setSpeed(i)}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="sub">
          event {idx + 1} / {n}
        </span>
      </div>
      <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => (setIdx(Number(e.target.value)), setPlaying(false))} aria-label="Scrub" />
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
