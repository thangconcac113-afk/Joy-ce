// Data for the team's "Monthly Dashboard" Google Sheet. A small Apps Script inside the sheet calls
// /api/export/sheet on a weekly trigger and writes these rows into "Auto - ..." tabs.
// Impressions and CTR are left out on purpose: YouTube does not expose them through any API.

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export type ChannelKey = "main" | "vn" | "aov";

export interface SheetVideo {
  videoId: string;
  channel: ChannelKey;
  label: string;
  publishedAt: string;
  format: "Long" | "Short";
  title: string;
  url: string | null;
  views: number;
  /** Seconds, last 28 days, from YouTube Analytics. Null until the channel is connected. */
  avdSec: number | null;
  /** Percent of the video watched on average, same window. */
  viewedPct: number | null;
}

export interface SheetMonth {
  channel: ChannelKey;
  month: string;
  videos: number;
  long: number;
  short: number;
  avgViews: number;
  peakViews: number;
}

/** Videos up to this length count as Shorts. YouTube does not tell us the format, so length is the best signal. */
export const SHORT_MAX_SEC = 90;

const CHANNELS: Record<string, ChannelKey> = { "@teamsecret": "main", "@teamsecretlol": "vn", "@teamsecretaov": "aov" };

export const channelKey = (handle: string | null): ChannelKey | null => CHANNELS[(handle ?? "").toLowerCase()] ?? null;

export const formatOf = (durationSec: number | null): "Long" | "Short" => (durationSec !== null && durationSec <= SHORT_MAX_SEC ? "Short" : "Long");

/** The sheet's own game labels: VN channel is LOL, AOV channel is AOV, the main channel mixes Valorant and LoL. */
export function labelOf(channel: ChannelKey, title: string): string {
  if (channel === "vn") return "LOL";
  if (channel === "aov") return "AOV";
  if (/valorant|vct|\bval\b/i.test(title)) return "VAL";
  if (/league|\blol\b|tsw|worlds|msi|lcp/i.test(title)) return "LOL";
  return "";
}

export function monthly(videos: SheetVideo[]): SheetMonth[] {
  const groups = new Map<string, SheetVideo[]>();
  for (const v of videos) {
    const k = `${v.channel}|${v.publishedAt.slice(0, 7)}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  return [...groups.entries()]
    .map(([k, vs]) => {
      const [channel, month] = k.split("|") as [ChannelKey, string];
      const views = vs.map((v) => v.views);
      return {
        channel,
        month,
        videos: vs.length,
        long: vs.filter((v) => v.format === "Long").length,
        short: vs.filter((v) => v.format === "Short").length,
        avgViews: Math.round(views.reduce((a, b) => a + b, 0) / vs.length),
        peakViews: Math.max(...views),
      };
    })
    .sort((a, b) => (a.month === b.month ? a.channel.localeCompare(b.channel) : b.month.localeCompare(a.month)));
}

interface Raw {
  external_id: string;
  handle: string | null;
  title: string;
  url: string | null;
  published_at: string | Date | null;
  duration_sec: number | null;
  views: number | string;
  avd_sec: number | null;
  avg_view_pct: number | null;
}

export async function getSheetVideos(db: Db, days: number, now = new Date()): Promise<SheetVideo[]> {
  const since = new Date(now.getTime() - days * 86400_000).toISOString();
  const res = (await db.execute(sql`
    select v.external_id, a.handle, v.title, v.url, v.published_at, v.duration_sec, last.views, va.avd_sec, va.avg_view_pct
    from videos v
    join accounts a on a.id = v.account_id and a.platform = 'youtube'
    join lateral (select views from video_snapshots s where s.video_id = v.id order by taken_at desc limit 1) last on true
    left join video_analytics va on va.video_id = v.id
    where v.published_at >= ${since}::timestamptz
    order by v.published_at desc`)) as unknown as { rows: Raw[] };
  const out: SheetVideo[] = [];
  for (const r of res.rows) {
    const channel = channelKey(r.handle);
    if (!channel || !r.published_at) continue;
    out.push({
      videoId: r.external_id,
      channel,
      label: labelOf(channel, r.title),
      publishedAt: new Date(r.published_at).toISOString(),
      format: formatOf(r.duration_sec),
      title: r.title,
      url: r.url,
      views: Number(r.views),
      avdSec: r.avd_sec === null ? null : Math.round(r.avd_sec),
      viewedPct: r.avg_view_pct === null ? null : Math.round(r.avg_view_pct * 10) / 10,
    });
  }
  return out;
}
