// A GM series stopped between maps: review how the maps so far went and choose the
// lineup for the next one (sub swaps).
import { useState } from "react";
import { gmSetPauseBetweenMaps, playerInfo, submitGmMapLineup, type Mode, type Ratings } from "../../engine";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";

const MODE_NAME: Record<Mode, string> = { hp: "Hardpoint", snd: "Search & Destroy", control: "Control", overload: "Overload" };
const MODE_STAT: Record<Mode, keyof Ratings> = { hp: "hp_obj", snd: "snd_iq", control: "third_mode", overload: "third_mode" };

export function BetweenMaps({ store, onPlayed }: { store: SeasonStore; onPlayed: (seriesId: string) => void }) {
  const { state, data, mutate } = store;
  const gm = state.gm!;
  const { spec, gmSide, between } = state.pending!;
  const b = between!;
  const dir = directory(data);
  const idx = { get: (id: string) => playerInfo(state, data, id) };
  const opp = spec.teams[gmSide === 0 ? 1 : 0];
  const [lineup, setLineup] = useState<string[]>(b.lineup);
  const [error, setError] = useState<string | null>(null);
  const mine = b.score[gmSide];
  const theirs = b.score[gmSide === 0 ? 1 : 0];
  const stat = MODE_STAT[b.nextMode];

  const play = (rest: boolean, stopPausing = false) => {
    const err = mutate((s) => {
      if (stopPausing) gmSetPauseBetweenMaps(s, false);
      submitGmMapLineup(s, lineup, rest);
    });
    if (err) setError(err);
    else onPlayed(spec.id);
  };
  const toggle = (id: string) => setLineup(lineup.includes(id) ? lineup.filter((p) => p !== id) : [...lineup, id]);
  const ready = lineup.length === 4;

  return (
    <div>
      <div className="card">
        <div className="pill">
          Your match · Bo{spec.bestOf} · between maps
        </div>
        <div className="match-head" style={{ marginTop: 6 }}>
          <div className="side">
            <span className="big">{dir.team(spec.teams[gmSide]).name}</span>
          </div>
          <div className="sscore">
            {mine}–{theirs}
          </div>
          <div className="side right">
            <span className="big">{dir.team(opp).name}</span>
          </div>
        </div>
        <div className="sub" style={{ marginTop: 6 }}>
          {spec.label} · Next: <b>Map {b.nextSlot}</b> — {b.nextMap} {MODE_NAME[b.nextMode]}
        </div>
        {error && <div className="sub" style={{ color: "var(--ban)", marginTop: 6 }}>{error}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>So far</h3>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">Map</th>
                <th>Score</th>
                {b.played[0]!.gmLines.map((_, i) => (
                  <th key={i} />
                ))}
              </tr>
            </thead>
            <tbody>
              {b.played.map((m) => {
                const won = m.winner === gmSide;
                return (
                  <tr key={m.slot}>
                    <td className="left">
                      Map {m.slot} · {m.map} {m.mode.toUpperCase()}
                    </td>
                    <td>
                      <b style={{ color: won ? "var(--pick)" : "var(--ban)" }}>{won ? "W" : "L"}</b> {m.score[gmSide]}–{m.score[gmSide === 0 ? 1 : 0]}
                    </td>
                    {m.gmLines.map((l) => (
                      <td key={l.player} title={`${l.kills} kills, ${l.deaths} deaths`}>
                        {dir.player(l.player)} <span className="muted">{l.kills}-{l.deaths}</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Lineup for Map {b.nextSlot}</h3>
          <span className="sub">
            Ratings shown: slaying / {MODE_NAME[b.nextMode]}
          </span>
        </div>
        <div className="veto" style={{ marginBottom: 12 }}>
          {gm.roster.map((id) => {
            const p = idx.get(id);
            const on = lineup.includes(id);
            return (
              <button
                key={id}
                className="btn"
                aria-pressed={on}
                style={on ? { borderColor: "var(--text)", fontWeight: 600 } : undefined}
                onClick={() => toggle(id)}
              >
                {on ? "✓ " : ""}
                {p?.handle ?? id}{" "}
                <span className="muted">
                  {p ? `${Math.round(p.ratings.slaying)} / ${Math.round(p.ratings[stat])}` : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <button className="btn primary" disabled={!ready} onClick={() => play(false)}>
            {ready ? `Play Map ${b.nextSlot}` : `Pick 4 players (${lineup.length})`}
          </button>
          <button className="btn" disabled={!ready} onClick={() => play(true)} title="Use this lineup for every remaining map without stopping">
            Play the rest of the series
          </button>
          <button className="btn" disabled={!ready} onClick={() => play(true, true)} title="Turn off pausing between maps for future series too">
            Play on, stop pausing
          </button>
          {gm.roster.length <= 4 && <span className="sub">Sign a 5th player between stages to have someone to sub in.</span>}
        </div>
      </div>
    </div>
  );
}
