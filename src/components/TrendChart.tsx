"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/metrics";
import { fmt, fmtFull } from "./format";

type Key = "youtube" | "tiktok";
const SERIES: Record<Key, { label: string; color: string; key: string }> = {
  youtube: { label: "YouTube", color: "var(--series-yt)", key: "key-yt" },
  tiktok: { label: "TikTok", color: "var(--series-tt)", key: "key-tt" },
};

function tickTime(t: string, bucket: "hour" | "day") {
  const d = new Date(t);
  return bucket === "hour"
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: Key; value: number }[];
  bucket: "hour" | "day";
}

function Tip({ active, label, payload, bucket }: TipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-time">
        {bucket === "hour"
          ? new Date(label).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : new Date(label).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
      </div>
      {payload.map((p) => (
        <div className="tooltip-row" key={p.dataKey}>
          <b>{fmtFull(p.value)}</b>
          <span>
            <i className={`key ${SERIES[p.dataKey].key}`} aria-hidden />
            {SERIES[p.dataKey].label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Direct label at the line end only (labels are selective, never on every point). */
function endLabel(key: Key, lastIndex: number) {
  // eslint-disable-next-line react/display-name
  return (props: { x?: number | string; y?: number | string; index?: number; value?: unknown }) => {
    if (props.index !== lastIndex || props.x === undefined || props.y === undefined) return null;
    return (
      <text x={Number(props.x) + 6} y={Number(props.y)} dy={4} fontSize={12} fill="var(--ink-2)">
        {SERIES[key].label} {fmt(Number(props.value))}
      </text>
    );
  };
}

export function TrendChart({
  title,
  subtitle,
  data,
  keys,
  bucket,
}: {
  title: string;
  subtitle: string;
  data: SeriesPoint[];
  keys: Key[];
  bucket: "hour" | "day";
}) {
  const total = (k: Key) => data.reduce((s, p) => s + p[k], 0);
  const lastIndex = data.length - 1;
  return (
    <section className="card chart-card" aria-label={title}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-sub">{subtitle}</p>
        </div>
        {keys.length > 1 && (
          <div className="legend">
            {keys.map((k) => (
              <span key={k}>
                <i className={`key ${SERIES[k].key}`} aria-hidden /> {SERIES[k].label} · {fmt(total(k))}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: keys.length > 1 ? 96 : 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey="t"
              tickFormatter={(t) => tickTime(t, bucket)}
              stroke="var(--axis)"
              tick={{ fill: "var(--muted)", fontSize: 11.5 }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis tickFormatter={(v) => fmt(v)} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11.5 }} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
            <Tooltip content={<Tip bucket={bucket} />} cursor={{ stroke: "var(--axis)", strokeWidth: 1 }} />
            {keys.map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={SERIES[k].color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4.5, stroke: "var(--surface)", strokeWidth: 2 }}
                label={keys.length > 1 ? endLabel(k, lastIndex) : undefined}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary className="card-sub" style={{ cursor: "pointer", margin: "6px 0" }}>
          View as table
        </summary>
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{bucket === "hour" ? "Hour" : "Day"}</th>
                {keys.map((k) => (
                  <th key={k} className="num">
                    {SERIES[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.t}>
                  <td>{tickTime(p.t, bucket)}</td>
                  {keys.map((k) => (
                    <td key={k} className="num">
                      {fmtFull(p[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
