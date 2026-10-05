const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : compact.format(n));
export const fmtFull = (n: number | null | undefined) => (n === null || n === undefined ? "—" : full.format(n));
export const signed = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${compact.format(n)}`);

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function duration(sec: number | null): string | null {
  if (sec === null || sec === undefined) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

type T = (key: string, vars?: Record<string, number>) => string;
const plain: T = (k, v) => (v ? k.replace("{n}", String(v.n)) : k);

export function ago(isoTime: string | null, now = Date.now(), t: T = plain): string {
  if (!isoTime) return t("never");
  const s = Math.max(0, Math.round((now - new Date(isoTime).getTime()) / 1000));
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.round(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.round(s / 3600) });
  return t("{n} d ago", { n: Math.round(s / 86400) });
}

export const date = (isoTime: string | null) =>
  isoTime ? new Date(isoTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const PLATFORM_LABEL = { youtube: "YouTube", tiktok: "TikTok" } as const;

export const shortDate = (isoTime: string | null) =>
  isoTime ? new Date(isoTime).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
