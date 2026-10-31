// The end-of-season review, and a share card drawn on a canvas you can download.
import { useMemo } from "react";
import { ordinal, seasonReview, type SeasonReview } from "../../engine";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";

const placeText = (p: [number, number] | null) => (!p ? "—" : p[0] === p[1] ? ordinal(p[0]) : `${ordinal(p[0])}–${ordinal(p[1])}`);

export function SeasonReviewCard({ store }: { store: SeasonStore }) {
  const { state, data, version } = store;
  const dir = directory(data);
  const r = useMemo(() => seasonReview(state, data), [state, data, version]);
  const { recap } = r;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h3>Season review: {r.label}</h3>
        <div className="spacer" />
        <button className="btn small" onClick={() => downloadCard(r, dir.team(recap.team).abbr)}>
          Download share card
        </button>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span className="l">Points finish</span>
          <span className="v">{ordinal(recap.rank)}</span>
          <span className="sub">{recap.points} points</span>
        </div>
        <div className="kpi">
          <span className="l">Series record</span>
          <span className="v">
            {recap.record[0]}-{recap.record[1]}
          </span>
        </div>
        <div className="kpi">
          <span className="l">Titles</span>
          <span className="v">{recap.eventsWon.length || "—"}</span>
          <span className="sub">{recap.eventsWon.join(", ")}</span>
        </div>
        <div className="kpi">
          <span className="l">Top performer</span>
          <span className="v">{r.topPerformer?.handle ?? "—"}</span>
          {r.topPerformer && (
            <span className="sub">
              {r.topPerformer.kd.toFixed(2)} K/D over {r.topPerformer.maps} maps
            </span>
          )}
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div>
          <div>
            <b>Best win:</b> {r.bestWin ? `${r.bestWin.score[0]}–${r.bestWin.score[1]} vs ${dir.team(r.bestWin.opponent).name} (${r.bestWin.label})` : "—"}
          </div>
          <div>
            <b>Worst loss:</b> {r.worstLoss ? `${r.worstLoss.score[0]}–${r.worstLoss.score[1]} vs ${dir.team(r.worstLoss.opponent).name} (${r.worstLoss.label})` : "—"}
          </div>
          <div>
            <b>Awards:</b> {r.awards.length ? r.awards.map((a) => `${a.award} (${a.handle})`).join(", ") : "—"}
          </div>
        </div>
        <table className="tbl">
          <tbody>
            {r.finishes.map((f) => (
              <tr key={f.name}>
                <td className="left">{f.name}</td>
                <td>{placeText(f.place)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Draws the review as a 1200×630 image and downloads it. */
function downloadCard(r: SeasonReview, abbr: string) {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const g = c.getContext("2d")!;
  g.fillStyle = "#121211";
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#3987e5";
  g.fillRect(0, 0, 1200, 10);
  g.fillStyle = "#f0efec";
  g.font = "700 30px system-ui, sans-serif";
  g.fillText(`${r.label} · season review`, 60, 80);
  g.font = "800 72px system-ui, sans-serif";
  g.fillText(r.teamName, 60, 170);
  g.font = "600 28px system-ui, sans-serif";
  g.fillStyle = "#a9a8a3";
  g.fillText(abbr, 60, 210);
  const stat = (x: number, label: string, value: string) => {
    g.fillStyle = "#a9a8a3";
    g.font = "600 22px system-ui, sans-serif";
    g.fillText(label.toUpperCase(), x, 300);
    g.fillStyle = "#f0efec";
    g.font = "800 54px system-ui, sans-serif";
    g.fillText(value, x, 360);
  };
  stat(60, "Points finish", ordinal(r.recap.rank));
  stat(340, "Record", `${r.recap.record[0]}-${r.recap.record[1]}`);
  stat(620, "Titles", String(r.recap.eventsWon.length));
  stat(860, "Goals met", `${r.recap.goalsMet}/${r.recap.goalsTotal}`);
  g.font = "500 26px system-ui, sans-serif";
  g.fillStyle = "#f0efec";
  const lines = [
    r.recap.eventsWon.length ? `Won ${r.recap.eventsWon.join(", ")}` : "No titles this time",
    r.topPerformer ? `Top performer: ${r.topPerformer.handle} (${r.topPerformer.kd.toFixed(2)} K/D)` : "",
    r.awards.length ? `Awards: ${r.awards.map((a) => `${a.award} (${a.handle})`).join(", ")}` : "",
  ].filter(Boolean);
  lines.forEach((l, i) => g.fillText(l.length > 80 ? `${l.slice(0, 79)}…` : l, 60, 450 + i * 44));
  g.fillStyle = "#a9a8a3";
  g.font = "500 20px system-ui, sans-serif";
  g.fillText("CDL Season Sim", 60, 600);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `${r.label.replace(/\s+/g, "-")}-${abbr}-review.png`;
  a.click();
}
