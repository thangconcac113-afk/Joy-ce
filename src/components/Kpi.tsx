import { fmt, fmtFull, pctChange } from "./format";
import { Sparkline } from "./Sparkline";

export function Kpi({ label, value, current, previous, period, hint, note, compareLabel, trend, trendColor = "var(--muted)" }: { label: string; value: number; current: number; previous: number; period: string; hint?: string; note?: string; compareLabel?: string; trend?: number[]; trendColor?: string }) {
  const pct = pctChange(current, previous);
  const dir = pct === null || Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return (
    <div className="card kpi" title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-row">
        <div className="kpi-value" title={fmtFull(value)}>
          {fmt(value)}
        </div>
        {trend && <Sparkline values={trend} color={trendColor} label={`${label} trend`} />}
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
