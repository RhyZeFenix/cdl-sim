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
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
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
