import { useMemo, useState } from "react";
import { addLines, emptyLine, mapLogEntries, replaySeries, type MapResult, type Mode, type PlayerLine } from "../../engine";
import type { Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { Seg, TeamTag } from "./common";
import { Watch } from "./Watch";

type Col = { key: keyof PlayerLine | "kd"; label: string; modes?: Mode[] };
const COLS: Col[] = [
  { key: "kills", label: "K" },
  { key: "deaths", label: "D" },
  { key: "kd", label: "K/D" },
  { key: "damage", label: "Dmg" },
  { key: "hillTime", label: "Hill s", modes: ["hp"] },
  { key: "firstBloods", label: "FB", modes: ["snd"] },
  { key: "plants", label: "Plants", modes: ["snd"] },
  { key: "defuses", label: "Defuses", modes: ["snd"] },
  { key: "clutches", label: "Clutch", modes: ["snd"] },
  { key: "zoneCaps", label: "Zones", modes: ["control"] },
  { key: "pickups", label: "Carries", modes: ["overload"] },
  { key: "oCaps", label: "Caps", modes: ["overload"] },
];

function BoxScore({ lines, handles, teams, modes }: { lines: PlayerLine[]; handles: string[]; teams: [string, string]; modes: Mode[] }) {
  const cols = COLS.filter((c) => !c.modes || c.modes.some((m) => modes.includes(m)));
  const val = (l: PlayerLine, c: Col) => (c.key === "kd" ? (l.kills / Math.max(1, l.deaths)).toFixed(2) : l[c.key]);
  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            <th>Player</th>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={i === 4 ? "divider" : ""}>
              <td>
                <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>
                  {teams[i < 4 ? 0 : 1]}
                </span>
                {handles[i]}
              </td>
              {cols.map((c) => (
                <td key={c.key}>{val(l, c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatchView({ store, seriesId, autoWatch, onBack, nav }: { store: SeasonStore; seriesId: string; autoWatch: boolean; onBack: () => void; nav: Nav }) {
  const { state, data } = store;
  const dir = directory(data);
  const rec = state.series[seriesId];
  // Series stored without events (online matches) are rebuilt exactly from the seed.
  const maps: MapResult[] = useMemo(() => {
    if (!rec) return [];
    return rec.hasEvents ? (rec.maps as MapResult[]) : replaySeries(state, data, seriesId).maps;
  }, [rec, state, data, seriesId]);
  const [sel, setSel] = useState<number | "series">(0);
  const [panel, setPanel] = useState<"log" | "watch">(autoWatch ? "watch" : "log");

  if (!rec) {
    return (
      <div className="card">
        <button className="btn" onClick={onBack}>
          ‹ Back
        </button>
        <div className="empty">That match hasn't been played.</div>
      </div>
    );
  }

  const t0 = dir.team(rec.teams[0]);
  const t1 = dir.team(rec.teams[1]);
  const abbr: [string, string] = [t0.abbr, t1.abbr];
  const winnerSide = rec.winner === rec.teams[0] ? 0 : 1;
  const map = sel === "series" ? null : maps[sel];
  const handles = (m: MapResult) => m.lineup.map((id) => dir.player(id));
  const seriesLines = maps.length
    ? maps[0]!.lineup.map((_, i) => maps.reduce((acc, m) => addLines(acc, m.box[i]!), emptyLine()))
    : [];
  const ev = state.events.findIndex((e) => e.matches.some((m) => m.seriesId === seriesId));

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={onBack}>
          ‹ Back
        </button>
        <span className="sub">
          {rec.label} · {rec.date} · Bo{rec.bestOf} · pool “{data.season.mapPools.find((p) => p.id === rec.poolId)?.label}”
        </span>
        <div className="spacer" />
        {ev >= 0 && (
          <button className="btn small" onClick={() => nav.openBracket(ev)}>
            View bracket
          </button>
        )}
      </div>

      <div className="card">
        <div className="match-head">
          <div className={`side ${winnerSide === 1 ? "lost" : ""}`}>
            <span className="abbr" style={{ alignSelf: "flex-start" }}>{t0.abbr}</span>
            <span className="big">{t0.name}</span>
          </div>
          <div className="sscore">
            {rec.score[0]}–{rec.score[1]}
          </div>
          <div className={`side right ${winnerSide === 0 ? "lost" : ""}`}>
            <span className="abbr">{t1.abbr}</span>
            <span className="big">{t1.name}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Veto</h3>
          <span className="sub">
            Team A: {abbr[rec.veto.teamA]} · the higher seed ({abbr[0]}) chooses whether to be Team A or B
          </span>
        </div>
        <div className="veto">
          {rec.veto.records.map((v, i) => {
            if (v.action === "side") {
              return (
                <span key={i} className="vchip">
                  <span className="k">SIDE</span> {abbr[v.team]} · Map {v.slot}: {v.side}
                </span>
              );
            }
            if (v.action === "skip-ban") {
              return (
                <span key={i} className="vchip skip" title="Skipped: the pool would be too small for the series">
                  <span className="k">NO BAN</span> {abbr[v.team]} · {v.mode.toUpperCase()}
                </span>
              );
            }
            return (
              <span key={i} className={`vchip ${v.action}`}>
                <span className="k">{v.action === "remaining" ? "LEFT" : v.action.toUpperCase()}</span>
                {"team" in v ? `${abbr[v.team]} · ` : ""}
                {"slot" in v ? `Map ${v.slot}: ` : ""}
                {v.map} {v.mode.toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="maps">
          {rec.veto.maps.map((vm, i) => {
            const m = maps[i];
            return (
              <button key={vm.slot} className={`mapcard ${m ? "" : "unplayed"}`} aria-pressed={sel === i} disabled={!m} onClick={() => setSel(i)}>
                <span className="pill">
                  Map {vm.slot} · {vm.mode === "hp" ? "Hardpoint" : vm.mode === "snd" ? "Search & Destroy" : vm.mode === "control" ? "Control" : "Overload"}
                </span>
                <b>{vm.map}</b>
                <span className="mscore">{m ? `${m.score[0]}–${m.score[1]} · ${abbr[m.winner]}` : "not played"}</span>
              </button>
            );
          })}
          <button className="mapcard" aria-pressed={sel === "series"} onClick={() => setSel("series")}>
            <span className="pill">Totals</span>
            <b>Series box score</b>
            <span className="mscore">{maps.length} maps</span>
          </button>
        </div>
      </div>

      {sel === "series" ? (
        <div className="card">
          <div className="card-head">
            <h3>Series box score</h3>
          </div>
          {maps[0] && <BoxScore lines={seriesLines} handles={handles(maps[0])} teams={abbr} modes={[...new Set(maps.map((m) => m.mode))]} />}
        </div>
      ) : map ? (
        <>
          <div className="card">
            <div className="card-head">
              <h3>
                {map.map} {map.mode.toUpperCase()} — {abbr[0]} {map.score[0]}–{map.score[1]} {abbr[1]}
              </h3>
              <span className="sub">{Math.round(map.durationSec / 60)} min</span>
              <div className="spacer" />
              <Seg
                label="Map panel"
                value={panel}
                onChange={setPanel}
                options={[
                  { value: "log", label: "Play-by-play" },
                  { value: "watch", label: "Watch" },
                ]}
              />
            </div>
            {panel === "watch" ? (
              <Watch map={map} teams={abbr} players={handles(map)} autoPlay={autoWatch} />
            ) : (
              <div className="log">
                {mapLogEntries(map, { team: abbr, player: handles(map) }).map((l) => (
                  <div key={l.i}>{l.text}</div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head">
              <h3>Box score</h3>
            </div>
            <BoxScore lines={map.box} handles={handles(map)} teams={abbr} modes={[map.mode]} />
          </div>
        </>
      ) : null}

      <div className="sub" style={{ marginTop: 8 }}>
        <TeamTag team={dir.team(rec.winner)} full={false} /> win {Math.max(...rec.score)}–{Math.min(...rec.score)}
      </div>
    </div>
  );
}
