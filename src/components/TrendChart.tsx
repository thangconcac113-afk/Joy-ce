"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/metrics";
import { fmt, fmtFull } from "./format";
import { useI18n } from "./I18n";

type Key = "youtube" | "tiktok";
const SERIES: Record<Key, { label: string; color: string; key: string }> = {
  youtube: { label: "YouTube", color: "var(--series-yt)", key: "key-yt" },
  tiktok: { label: "TikTok", color: "var(--series-tt)", key: "key-tt" },
};

function tickTime(t: string, bucket: "hour" | "day", tag: string) {
  const d = new Date(t);
  return bucket === "hour"
    ? d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(tag, { day: "numeric", month: "short" });
}

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: Key; value: number }[];
  bucket: "hour" | "day";
  tag: string;
}

function Tip({ active, label, payload, bucket, tag }: TipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-time">
        {bucket === "hour"
          ? new Date(label).toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : new Date(label).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" })}
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
  headerExtra,
  height = 240,
}: {
  title: string;
  subtitle: string;
  data: SeriesPoint[];
  keys: Key[];
  bucket: "hour" | "day";
  headerExtra?: React.ReactNode;
  height?: number;
}) {
  const { t, tag } = useI18n();
  const total = (k: Key) => data.reduce((s, p) => s + p[k], 0);
  const lastIndex = data.length - 1;
  return (
    <section className="card chart-card" aria-label={title}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-sub">{subtitle}</p>
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
        {headerExtra}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: keys.length > 1 ? 96 : 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey="t"
              tickFormatter={(v) => tickTime(v, bucket, tag)}
              stroke="var(--axis)"
              tick={{ fill: "var(--muted)", fontSize: 11.5 }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis tickFormatter={(v) => fmt(v)} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11.5 }} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
            <Tooltip content={<Tip bucket={bucket} tag={tag} />} cursor={{ stroke: "var(--axis)", strokeWidth: 1 }} />
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
          {t("View as table")}
        </summary>
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{bucket === "hour" ? t("Hour") : t("Day")}</th>
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
                  <td>{tickTime(p.t, bucket, tag)}</td>
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
