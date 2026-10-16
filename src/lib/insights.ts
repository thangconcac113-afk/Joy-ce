import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PlatformFilter } from "./metrics";
export const CONTENT_TYPES = ["Meme", "Highlights", "Mic check", "BTS", "Interview", "Announcement", "Sponsor", "Other"] as const;
export type InsightQuery = { platform: PlatformFilter; accountId?: number | null; days: number; hours: number; contentType?: string; game?: string; campaign?: string };
export type InsightVideo = {
  id: number; title: string; accountTitle: string; accountId: number; platform: "youtube" | "tiktok";
  publishedAt: string; thumbnailUrl: string | null; contentType: string | null; game: string | null; campaign: string | null; editor: string | null;
  durationSec: number | null; views: number; likes: number; comments: number; shares: number;
  ageViews: number | null; ageEngagements: number | null; ageSampleAt: string | null;
};
export const median = (values: number[]) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y); const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
export function groupInsights(items: InsightVideo[], dimension: "contentType" | "game" | "campaign" | "editor" = "contentType") {
  const groups = new Map<string, InsightVideo[]>();
  for (const v of items) {
    // Keep platforms and channels separate so channel size cannot skew content comparisons.
    const label = v[dimension] || "Untagged";
    const length = v.durationSec == null ? "Unknown duration" : v.durationSec <= 60 ? "Up to 60s" : v.durationSec <= 180 ? "61-180s" : "Over 3 min";
    const key = `${v.accountId}|${label}|${length}`;
    const group = groups.get(key) ?? []; group.push(v); groups.set(key, group);
  }
  return [...groups.entries()].map(([key, vs]) => {
    const eligible = vs.filter((v) => v.ageViews != null);
    return { key, label: vs[0][dimension] || "Untagged", accountTitle: vs[0].accountTitle, platform: vs[0].platform, length: key.split("|").pop()!, videos: vs.length, samples: eligible.length, medianViews: median(eligible.map((v) => v.ageViews!)), medianEngagementRate: median(eligible.filter((v) => v.ageViews! > 0).map((v) => v.ageEngagements! / v.ageViews! * 100)) };
  }).sort((a, b) => (b.medianViews ?? -1) - (a.medianViews ?? -1));
}
export async function getInsights(db: Db, q: InsightQuery, now = new Date()) {
  const start = new Date(now.getTime() - q.days * 86400000);
  const conditions = [sql`v.published_at >= ${start.toISOString()}::timestamptz`, sql`v.published_at <= ${now.toISOString()}::timestamptz`];
  if (q.platform !== "all") conditions.push(sql`a.platform = ${q.platform}`);
  if (q.accountId) conditions.push(sql`a.id = ${q.accountId}`);
  if (q.contentType) conditions.push(sql`v.content_type = ${q.contentType}`);
  if (q.game) conditions.push(sql`v.game ilike ${q.game.replace(/[%_\\]/g, "\\$&")}`);
  if (q.campaign) conditions.push(sql`v.campaign ilike ${q.campaign.replace(/[%_\\]/g, "\\$&")}`);
  const result = await db.execute(sql`
    select v.id, v.title, a.title as "accountTitle", a.id as "accountId", a.platform,
      v.published_at as "publishedAt", v.thumbnail_url as "thumbnailUrl", v.duration_sec as "durationSec",
      v.content_type as "contentType", v.game, v.campaign, v.editor,
      coalesce(latest.views,0)::float8 as views, coalesce(latest.likes,0)::float8 as likes,
      coalesce(latest.comments,0)::float8 as comments, coalesce(latest.shares,0)::float8 as shares,
      milestone.views::float8 as "ageViews", milestone.eng::float8 as "ageEngagements", milestone.taken_at as "ageSampleAt"
    from videos v join accounts a on a.id = v.account_id
    left join lateral (select * from video_snapshots s where s.video_id = v.id and s.taken_at <= ${now.toISOString()}::timestamptz order by s.taken_at desc limit 1) latest on true
    left join lateral (
      select s.views, coalesce(s.likes,0)+coalesce(s.comments,0)+coalesce(s.shares,0) as eng, s.taken_at from video_snapshots s
      where s.video_id = v.id
        and s.taken_at <= v.published_at + (${q.hours} * interval '1 hour')
        and s.taken_at >= v.published_at + ((${q.hours} - 1) * interval '1 hour')
        and v.published_at + (${q.hours} * interval '1 hour') <= ${now.toISOString()}::timestamptz
        and exists (select 1 from account_snapshots tracked where tracked.account_id = a.id and tracked.taken_at <= v.published_at)
      order by s.taken_at desc limit 1
    ) milestone on true
    where ${sql.join(conditions, sql` and `)} order by v.published_at desc`);
  const items = (result as unknown as { rows: InsightVideo[] }).rows;
  return { generatedAt: now.toISOString(), hours: q.hours, days: q.days, items, groups: groupInsights(items), eligible: items.filter((v) => v.ageViews != null).length };
}
