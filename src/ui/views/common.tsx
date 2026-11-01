import type { TeamInfo } from "../names";

export function TeamTag({ team, full = true }: { team: TeamInfo; full?: boolean }) {
  return (
    <span className="team">
      <span className="abbr">{team.abbr}</span>
      {full && <span className="tname">{team.name}</span>}
    </span>
  );
}

export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Arrow keys (and Home/End) move between the buttons of a tab list or segmented
 * control and select the one they land on.
 */
export function arrowKeys(e: React.KeyboardEvent<HTMLElement>): void {
  const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in keys) && e.key !== "Home" && e.key !== "End") return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + keys[e.key]! + items.length) % items.length;
  e.preventDefault();
  items[next]!.focus();
  items[next]!.click();
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label} onKeyDown={arrowKeys}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A player's name that opens their page. */
export function PlayerLink({ id, name, nav }: { id: string; name: string; nav?: { openPlayer(id: string): void } }) {
  if (!nav || id.startsWith("repl-")) return <>{name}</>;
  return (
    <button className="linklike" onClick={() => nav.openPlayer(id)} title={`Open ${name}'s page`}>
      {name}
    </button>
  );
}

/** A small "?" that explains something on hover or focus. */
export function Help({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0} role="note" aria-label={text} data-tip={text}>
      ?
    </span>
  );
}

/** A team name that opens the team's page. */
export function TeamLink({ team, nav, full = true }: { team: TeamInfo; nav?: { openTeam(id: string): void }; full?: boolean }) {
  if (!nav) return <TeamTag team={team} full={full} />;
  return (
    <button className="linklike team-link" onClick={() => nav.openTeam(team.id)} title={`Open ${team.name}`}>
      <TeamTag team={team} full={full} />
    </button>
  );
}
