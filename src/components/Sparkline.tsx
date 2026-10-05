/** Tiny trend line for tiles and channel cards. No axes: the number beside it carries the value. */
export function Sparkline({ values, color, label, height = 34 }: { values: number[]; color: string; label: string; height?: number }) {
  const w = 120;
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pad = 4;
  const x = (i: number) => (i / (values.length - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${d}L${x(last)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(values[last])} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
