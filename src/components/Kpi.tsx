import { fmt, fmtFull, pctChange } from "./format";

export function Kpi({ label, value, current, previous, period, hint, note, compareLabel }: { label: string; value: number; current: number; previous: number; period: string; hint?: string; note?: string; compareLabel?: string }) {
  const pct = pctChange(current, previous);
  const dir = pct === null || Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return (
    <div className="card kpi" title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" title={fmtFull(value)}>
        {fmt(value)}
      </div>
      {note && <div className="kpi-note">{note}</div>}
      <div className={`delta ${dir}`}>
        {pct === null ? (
          <span>No data for the previous period</span>
        ) : (
          <>
            <span aria-hidden>{dir === "up" ? "▲" : dir === "down" ? "▼" : "■"}</span>
            {Math.abs(pct) >= 1000 ? ">999" : Math.abs(pct).toFixed(1)}%
            <small>{compareLabel ?? `vs previous ${period}`}</small>
          </>
        )}
      </div>
    </div>
  );
}
