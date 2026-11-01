// About: where the data comes from, how the sim works, what's verified and what's
// approximate, and what changed.
import type { SeasonStore } from "../useSeason";

const CHANGELOG: { title: string; items: string[] }[] = [
  {
    title: "Maps",
    items: [
      "Map editor: trace over your own reference image, check it, save it to this browser or export it",
      "Buildings with doors and windows, upper floors, map colour themes, callouts, hold spots behind cover",
      "2D top-down replay, camera modes (auto-cut, follow player, overhead), minimap inset and kill feed",
      "Kill and death heatmaps per map; map pace from real results in the sim",
      "Faster title odds across several workers; installable offline app; player form on player pages",
    ],
  },
  {
    title: "Front office, part 3",
    items: [
      "Save slots and autosave in the browser; share links that open the exact same season",
      "GM difficulty, team chemistry and role balance, AI teams that trade with each other",
      "Achievements, a season review with a share card, and a career page",
      "Team pages, records and head-to-head, title odds, theme and contrast options, help tooltips",
    ],
  },
  {
    title: "Front office, part 2",
    items: ["Calendar and trade deadline, storylines and press conferences, staff, AI market offers and demands, Challengers academy, awards, practice planner"],
  },
  {
    title: "Front office, part 1",
    items: ["Scouting and weekly prep, inbox, player pages, morale, owner goals, contracts and salary cap, trades, dynasty seasons"],
  },
  { title: "Watching", items: ["Watch any match live from the Schedule; spoiler-free match day for GM teams; 3D replays on traced map layouts"] },
  { title: "Season sim", items: ["2024-2026 seasons with real formats, map pools and veto rules; ratings from real player stats; a backtest against real results"] },
];

export function About({ store }: { store: SeasonStore }) {
  const { data } = store;
  const unverified = data.season.unverified ?? [];
  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>About CDL Season Sim</h2>
        <p>
          A season simulator for the Call of Duty League: 2024 (Modern Warfare III), 2025 (Black Ops 6) and 2026 (Black Ops 7), with the real
          schedules, formats, map pools and veto rules. Every map is played out event by event (hills, rounds, possessions), so box scores and
          scores come from the same gunfights. Everything is deterministic from the seed, which is why a share link or a save rebuilds the
          exact same season.
        </p>
        <p className="sub">Not affiliated with Activision or the Call of Duty League. Team and player names are used to describe real results.</p>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Data sources</h3>
          <ul className="plain-list">
            <li>
              <b>CoD Esports Wiki</b> (Fandom): schedules, results, rosters and player stats (CC BY-SA).
            </li>
            <li>
              <b>Liquipedia</b>: bracket formats and seeding, checked event by event (CC BY-SA).
            </li>
            <li>
              <b>GamesAtlas</b>: minimaps and Hardpoint rotations, used only as references to trace the 3D layouts (no images are shipped).
            </li>
            <li>
              <b>Official CDL competitive settings</b>: map pools and mode rules.
            </li>
          </ul>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>How ratings work</h3>
          <p style={{ margin: 0 }}>
            Player ratings blend each player's real season stats (K/D by mode, Hardpoint time, SnD openings) with their team's placements,
            shrunk toward average for small samples. Team map preferences come from real map win rates. The engine's tuning was fitted by a
            backtest: simulating each real season hundreds of times and comparing with what actually happened.
          </p>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Verified vs approximate</h3>
          <ul className="plain-list">
            <li>✓ Formats, seeding and bracket pairings (checked against Liquipedia)</li>
            <li>✓ Map pools per stage and Hardpoint hill counts and order</li>
            <li>≈ 3D layouts: traced by eye from minimaps</li>
            <li>≈ Bomb sites, Control zones and Overload goals: placed by eye (not published)</li>
            <li>≈ 6 Star hill positions: guessed from their names</li>
            <li>≈ Ages, staff and Challengers prospects: generated</li>
            {unverified.map((u, i) => (
              <li key={i}>? {u}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>What's new</h3>
          {CHANGELOG.map((c) => (
            <div key={c.title} style={{ marginBottom: 8 }}>
              <b>{c.title}</b>
              <ul className="plain-list">
                {c.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
