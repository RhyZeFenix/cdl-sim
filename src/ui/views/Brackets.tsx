import type { BracketSection, EventMatch, EventRecord } from "../../engine";
import type { Nav } from "../App";
import { directory, type Directory } from "../names";
import type { SeasonStore } from "../useSeason";

function MatchBox({ m, ev, dir, nav }: { m: EventMatch; ev: EventRecord; dir: Directory; nav: Nav }) {
  const seed = (t: string) => ev.seeds.indexOf(t) + 1;
  return (
    <button className="bm" onClick={() => nav.openMatch(m.seriesId)} title={`${m.def.label} · Bo${m.def.bestOf}`}>
      {m.teams.map((t, i) => (
        <div key={t} className={`bm-row ${m.winner === t ? "won" : ""}`}>
          <span className="seed">{seed(t)}</span>
          <span className="abbr">{dir.team(t).abbr}</span>
          <span className="score">{m.score[i]}</span>
        </div>
      ))}
      {m.def.bestOf !== 5 && <div className="bm-meta">Bo{m.def.bestOf}</div>}
    </button>
  );
}

function Rounds({ matches, ev, dir, nav, compact = false }: { matches: EventMatch[]; ev: EventRecord; dir: Directory; nav: Nav; compact?: boolean }) {
  const byRound = new Map<number, EventMatch[]>();
  for (const m of matches) byRound.set(m.def.round, [...(byRound.get(m.def.round) ?? []), m]);
  return (
    <div className={`rounds ${compact ? "compact" : ""}`}>
      {[...byRound.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([r, ms]) => (
          <div key={r} className="round-col">
            {!compact && <div className="round-label">{ms[0]!.def.label}</div>}
            <div className="round">
              {ms.map((m) => (
                <div key={m.def.id}>
                  {compact && <div className="round-label">{m.def.label.replace(/^Group \w+ /, "")}</div>}
                  <MatchBox m={m} ev={ev} dir={dir} nav={nav} />
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

const SECTION_TITLE: Record<BracketSection, string> = {
  group: "Groups",
  playin: "Play-In",
  single: "Bracket",
  upper: "Winners bracket",
  lower: "Losers bracket",
  final: "Grand Final",
};

export function Brackets({
  store,
  nav,
  selected,
  onSelect,
}: {
  store: SeasonStore;
  nav: Nav;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const { state, data } = store;
  const dir = directory(data);
  if (state.events.length === 0) return <div className="card empty">No Minors, Majors or Champs played yet. Sim to the end of a stage.</div>;
  const idx = selected !== null && state.events[selected] ? selected : state.events.length - 1;
  const ev = state.events[idx]!;
  const sections = (["group", "playin", "single", "upper", "lower", "final"] as const).filter((s) => ev.matches.some((m) => m.def.section === s));
  const placements = Object.entries(ev.placements).sort((a, b) => a[1][0] - b[1][0]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <select className="plain" value={idx} onChange={(e) => onSelect(Number(e.target.value))} aria-label="Event">
          {state.events.map((e, i) => (
            <option key={i} value={i}>
              {e.name}
              {e.stage ? ` · Stage ${e.stage}` : ""}
            </option>
          ))}
        </select>
        <span className="sub">
          {ev.seeds.length} teams · seeds: {ev.seeds.map((t) => dir.team(t).abbr).join(", ")}
        </span>
      </div>

      {sections.map((s) => {
        const ms = ev.matches.filter((m) => m.def.section === s);
        return (
          <section key={s} className="card bracket-section">
            <h3>{SECTION_TITLE[s]}</h3>
            {s === "group" ? (
              <div className="groups">
                {[...new Set(ms.map((m) => m.def.group!))].map((g) => (
                  <div key={g}>
                    <div className="round-label">Group {g}</div>
                    <Rounds matches={ms.filter((m) => m.def.group === g)} ev={ev} dir={dir} nav={nav} compact />
                  </div>
                ))}
              </div>
            ) : (
              <Rounds matches={ms} ev={ev} dir={dir} nav={nav} />
            )}
          </section>
        );
      })}

      <section className="card">
        <h3 style={{ marginBottom: 8 }}>Placements & points</h3>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Place</th>
                <th className="left">Team</th>
                <th>Seed</th>
                <th>CDL points</th>
              </tr>
            </thead>
            <tbody>
              {placements.map(([t, [f, to]]) => (
                <tr key={t}>
                  <td className="rank">{f === to ? f : `${f}–${to}`}</td>
                  <td className="left">
                    <span className="team">
                      <span className="abbr">{dir.team(t).abbr}</span>
                      <span className="tname">{dir.team(t).name}</span>
                    </span>
                  </td>
                  <td>{ev.seeds.indexOf(t) + 1}</td>
                  <td>{ev.points[t] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
