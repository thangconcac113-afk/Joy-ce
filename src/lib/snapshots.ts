import { sql } from "drizzle-orm";

/** A video older than this can't really be sitting at 0 views; a 0 then is a provider glitch. */
export const ZERO_VIEW_GRACE_MS = 86_400_000;

/**
 * SQL guard for video_snapshots rows: drop 0-view readings taken more than a day after
 * publish. TikTok sometimes returns view_count 0 for real videos; using that row as a
 * baseline turned a video's whole lifetime into "views gained" (AOV TikTok, Nov 2026).
 */
export const realSnapshot = (s = "s", v = "v") =>
  sql.raw(`(${s}.views > 0 or ${v}.published_at is null or ${s}.taken_at < ${v}.published_at + interval '1 day')`);

export function isGlitchReading(views: number, publishedAt: string | null, now: Date): boolean {
  return views === 0 && !!publishedAt && now.getTime() - Date.parse(publishedAt) > ZERO_VIEW_GRACE_MS;
}
