import { useMemo, useState } from "react";
import { addLines, emptyLine, markWatched, mapLogEntries, playerInfo, replaySeries, type MapResult, type Mode, type PlayerLine } from "../../engine";
import type { Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, Seg, TeamTag } from "./common";
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

function BoxScore({ lines, handles, ids, teams, modes, nav }: { lines: PlayerLine[]; handles: string[]; ids?: string[]; teams: [string, string]; modes: Mode[]; nav?: Nav }) {
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
                {ids ? <PlayerLink id={ids[i]!} name={handles[i]!} nav={nav} /> : handles[i]}
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
  const { state, data, spoil, mutate } = store;
  const dir = directory(data);
  const rec = state.series[seriesId];
  // Series stored without events (online matches) are rebuilt exactly from the seed.
  const maps: MapResult[] = useMemo(() => {
    if (!rec) return [];
    return rec.hasEvents ? (rec.maps as MapResult[]) : replaySeries(state, data, seriesId).maps;
  }, [rec, state, data, seriesId]);
  const [sel, setSel] = useState<number | "series">(0);
  const [panel, setPanel] = useState<"log" | "watch">(autoWatch ? "watch" : "log");

  // Spoiler-free match day: an unwatched GM series plays map by map.
  const live = spoil.unwatched.includes(seriesId);
  const [current, setCurrent] = useState(0);
  const [mapDone, setMapDone] = useState(false);

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
  if (!live && spoil.isHidden(seriesId)) {
    return (
      <div className="card">
        <button className="btn" onClick={onBack}>
          ‹ Back
        </button>
        <div className="empty">This result is hidden until you watch or skip your own match (it would give your result away).</div>
      </div>
    );
  }

  const t0 = dir.team(rec.teams[0]);
  const t1 = dir.team(rec.teams[1]);
  const abbr: [string, string] = [t0.abbr, t1.abbr];
  const winnerSide = rec.winner === rec.teams[0] ? 0 : 1;
  const handles = (m: MapResult) => m.lineup.map((id) => playerInfo(state, data, id)?.handle ?? dir.player(id));
  const ev = state.events.findIndex((e) => e.matches.some((m) => m.seriesId === seriesId));

  // How many maps' results may be shown, and the series score they add up to.
  const shown = live ? current + (mapDone ? 1 : 0) : maps.length;
  const shownScore = maps.slice(0, shown).reduce<[number, number]>(
    (acc, m) => {
      acc[m.winner]++;
      return acc;
    },
    [0, 0],
  );
  const finishWatching = () => mutate((s) => markWatched(s, seriesId));

  const map = live ? maps[current] : sel === "series" ? null : maps[sel];
  const seriesLines = maps.length
    ? maps[0]!.lineup.map((_, i) => maps.reduce((acc, m) => addLines(acc, m.box[i]!), emptyLine()))
    : [];
  const modeName = (mode: Mode) =>
    mode === "hp" ? "Hardpoint" : mode === "snd" ? "Search & Destroy" : mode === "control" ? "Control" : "Overload";

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
        {live && (
          <button className="btn small" onClick={finishWatching} title="Reveal the whole series now">
            Skip to result
          </button>
        )}
        {ev >= 0 && !live && (
          <button className="btn small" onClick={() => nav.openBracket(ev)}>
            View bracket
          </button>
        )}
      </div>

      <div className="card">
        {live && (
          <div className="pill" style={{ marginBottom: 6 }}>
            Watching live
          </div>
        )}
        <div className="match-head">
          <div className={`side ${!live && winnerSide === 1 ? "lost" : ""}`}>
            <span className="abbr" style={{ alignSelf: "flex-start" }}>
              {t0.abbr}
            </span>
            <button className="linklike big" onClick={() => nav.openTeam(t0.id)}>
              {t0.name}
            </button>
          </div>
          <div className="sscore">
            {shownScore[0]}–{shownScore[1]}
          </div>
          <div className={`side right ${!live && winnerSide === 0 ? "lost" : ""}`}>
            <span className="abbr">{t1.abbr}</span>
            <button className="linklike big" onClick={() => nav.openTeam(t1.id)}>
              {t1.name}
            </button>
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
            // While watching live, unplayed maps look the same as upcoming ones ("—"),
            // so the series length doesn't give the result away.
            const status = live
              ? i < shown
                ? `${m!.score[0]}–${m!.score[1]} · ${abbr[m!.winner]}`
                : i === current
                  ? "LIVE"
                  : "—"
              : m
                ? `${m.score[0]}–${m.score[1]} · ${abbr[m.winner]}`
                : "not played";
            return (
              <button
                key={vm.slot}
                className={`mapcard ${!live && !m ? "unplayed" : ""}`}
                aria-pressed={live ? i === current : sel === i}
                disabled={live || !m}
                onClick={() => setSel(i)}
              >
                <span className="pill">
                  Map {vm.slot} · {modeName(vm.mode)}
                </span>
                <b>{vm.map}</b>
                <span className="mscore" style={live && i === current && !mapDone ? { color: "var(--ban)" } : undefined}>
                  {status}
                </span>
              </button>
            );
          })}
          {!live && (
            <button className="mapcard" aria-pressed={sel === "series"} onClick={() => setSel("series")}>
              <span className="pill">Totals</span>
              <b>Series box score</b>
              <span className="mscore">{maps.length} maps</span>
            </button>
          )}
        </div>
      </div>

      {live && map ? (
        <>
          <div className="card">
            <div className="card-head">
              <h3>
                Map {current + 1}: {map.map} {modeName(map.mode)}
              </h3>
            </div>
            <Watch key={current} map={map} teams={abbr} players={handles(map)} autoPlay onFinished={() => setMapDone(true)} seed={`${seriesId}:${map.slot}`} />
          </div>
          {mapDone && (
            <div className="card">
              <div className="card-head">
                <h3>
                  {abbr[map.winner]} take Map {current + 1}, {Math.max(...map.score)}–{Math.min(...map.score)}
                </h3>
                <span className="sub">
                  Series {shownScore[0]}–{shownScore[1]}
                </span>
                <div className="spacer" />
                {current + 1 < maps.length ? (
                  <button
                    className="btn primary"
                    onClick={() => {
                      setCurrent(current + 1);
                      setMapDone(false);
                    }}
                  >
                    Watch Map {current + 2}
                  </button>
                ) : (
                  <button className="btn primary" onClick={finishWatching}>
                    Series over — see the full result
                  </button>
                )}
              </div>
              <BoxScore lines={map.box} handles={handles(map)} ids={map.lineup} teams={abbr} modes={[map.mode]} nav={nav} />
            </div>
          )}
        </>
      ) : sel === "series" ? (
        <div className="card">
          <div className="card-head">
            <h3>Series box score</h3>
          </div>
          {maps[0] && <BoxScore lines={seriesLines} handles={handles(maps[0])} ids={maps[0].lineup} teams={abbr} modes={[...new Set(maps.map((m) => m.mode))]} nav={nav} />}
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
              <Watch map={map} teams={abbr} players={handles(map)} autoPlay={autoWatch} seed={`${seriesId}:${map.slot}`} />
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
            <BoxScore lines={map.box} handles={handles(map)} ids={map.lineup} teams={abbr} modes={[map.mode]} nav={nav} />
          </div>
        </>
      ) : null}

      {!live && (
        <div className="sub" style={{ marginTop: 8 }}>
          <TeamTag team={dir.team(rec.winner)} full={false} /> win {Math.max(...rec.score)}–{Math.min(...rec.score)}
        </div>
      )}
    </div>
  );
}
