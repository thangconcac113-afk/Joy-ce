import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";

export const RANGES = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeKey = keyof typeof RANGES;
export type PlatformFilter = "all" | "youtube" | "tiktok";

export interface Filters {
  range: RangeKey;
  platform: PlatformFilter;
  accountId?: number | null;
  now?: Date;
}

export interface VideoRow {
  id: number;
  accountId: number;
  accountTitle: string;
  platform: "youtube" | "tiktok";
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  viewsGained: number;
  engagementsGained: number;
}

export interface AccountRow {
  id: number;
  platform: "youtube" | "tiktok";
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  followers: number | null;
  followersGained: number | null;
  viewsGained: number;
  engagementsGained: number;
  videosPublished: number;
  lastPolledAt: string | null;
  lastError: string | null;
}

export interface SeriesPoint {
  t: string;
  youtube: number;
  tiktok: number;
}

export interface Dashboard {
  generatedAt: string;
  filters: { range: RangeKey; platform: PlatformFilter; accountId: number | null };
  lastPoll: { finishedAt: string | null; accountsOk: number; accountsFailed: number } | null;
  kpis: {
    followers: number;
    followersGained: number;
    followersGainedPrev: number;
    viewsGained: number;
    viewsGainedPrev: number;
    engagements: number;
    engagementsPrev: number;
    videosPublished: number;
    videosPublishedPrev: number;
  };
  bucket: "hour" | "day";
  viewsSeries: SeriesPoint[];
  followersSeries: SeriesPoint[];
  accounts: AccountRow[];
  topVideos: VideoRow[];
}

const DAY = 86400_000;
const iso = (d: Date) => d.toISOString();
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

function scope(f: Filters, alias: { account: string }): SQL {
  const parts: SQL[] = [sql`true`];
  if (f.platform !== "all") parts.push(sql`${sql.raw(alias.account)}.platform = ${f.platform}`);
  if (f.accountId) parts.push(sql`${sql.raw(alias.account)}.id = ${f.accountId}`);
  return sql.join(parts, sql` and `);
}

async function rows<T>(db: Db, q: SQL): Promise<T[]> {
  const res = (await db.execute(q)) as unknown as { rows: T[] };
  return res.rows;
}

/**
 * Per-video gains between `start` and `end`: views at `end` minus views at `start`.
 * The baseline is the last snapshot at or before `start`; a video published inside
 * the window starts from 0; otherwise the first snapshot inside the window is used.
 */
function videoGainsQuery(f: Filters, start: Date, end: Date): SQL {
  return sql`
    select v.id, v.account_id, a.title as account_title, a.platform, v.title, v.url, v.thumbnail_url,
      v.published_at, v.duration_sec,
      last.views, last.likes, last.comments, last.shares,
      greatest(last.views - coalesce(base.views,
        case when v.published_at >= ${iso(start)}::timestamptz then 0 end, first.views, last.views), 0) as views_gained,
      greatest(
        (coalesce(last.likes,0) + coalesce(last.comments,0) + coalesce(last.shares,0)) -
        coalesce(base.eng, case when v.published_at >= ${iso(start)}::timestamptz then 0 end, first.eng,
          coalesce(last.likes,0) + coalesce(last.comments,0) + coalesce(last.shares,0)), 0) as engagements_gained
    from videos v
    join accounts a on a.id = v.account_id
    join lateral (
      select views, likes, comments, shares from video_snapshots s
      where s.video_id = v.id and s.taken_at <= ${iso(end)}::timestamptz
      order by taken_at desc limit 1) last on true
    left join lateral (
      select views, coalesce(likes,0)+coalesce(comments,0)+coalesce(shares,0) as eng from video_snapshots s
      where s.video_id = v.id and s.taken_at <= ${iso(start)}::timestamptz
      order by taken_at desc limit 1) base on true
    left join lateral (
      select views, coalesce(likes,0)+coalesce(comments,0)+coalesce(shares,0) as eng from video_snapshots s
      where s.video_id = v.id and s.taken_at > ${iso(start)}::timestamptz and s.taken_at <= ${iso(end)}::timestamptz
      order by taken_at asc limit 1) first on true
    where ${scope(f, { account: "a" })}`;
}

interface RawVideo {
  id: number;
  account_id: number;
  account_title: string;
  platform: "youtube" | "tiktok";
  title: string;
  url: string | null;
  thumbnail_url: string | null;
  published_at: string | Date | null;
  duration_sec: number | null;
  views: number | string;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  views_gained: number | string;
  engagements_gained: number | string;
}

const toIso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());

function toVideo(r: RawVideo): VideoRow {
  return {
    id: r.id,
    accountId: r.account_id,
    accountTitle: r.account_title,
    platform: r.platform,
    title: r.title,
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    publishedAt: toIso(r.published_at),
    durationSec: r.duration_sec,
    views: num(r.views),
    likes: num(r.likes),
    comments: num(r.comments),
    shares: num(r.shares),
    viewsGained: num(r.views_gained),
    engagementsGained: num(r.engagements_gained),
  };
}

/** Net follower change per account between start and end. */
function followerQuery(f: Filters, start: Date, end: Date): SQL {
  return sql`
    select a.id, last.followers as followers,
      last.followers - coalesce(base.followers, first.followers, last.followers) as gained
    from accounts a
    left join lateral (
      select followers from account_snapshots s
      where s.account_id = a.id and s.taken_at <= ${iso(end)}::timestamptz and s.followers is not null
      order by taken_at desc limit 1) last on true
    left join lateral (
      select followers from account_snapshots s
      where s.account_id = a.id and s.taken_at <= ${iso(start)}::timestamptz and s.followers is not null
      order by taken_at desc limit 1) base on true
    left join lateral (
      select followers from account_snapshots s
      where s.account_id = a.id and s.taken_at > ${iso(start)}::timestamptz and s.taken_at <= ${iso(end)}::timestamptz
        and s.followers is not null
      order by taken_at asc limit 1) first on true
    where ${scope(f, { account: "a" })}`;
}

/**
 * Gain per time bucket and platform. Each entity's value is reduced to its max per
 * bucket, then differenced against its previous bucket, so a video or account that
 * enters tracking never shows up as one giant spike.
 */
function seriesQuery(kind: "views" | "followers", f: Filters, start: Date, end: Date, unit: "hour" | "day"): SQL {
  const u = sql.raw(`'${unit}'`);
  const lookback = new Date(start.getTime() - (unit === "hour" ? DAY : 3 * DAY));
  const per =
    kind === "views"
      ? sql`select a.platform, s.video_id as entity, date_trunc(${u}, s.taken_at) as bucket, max(s.views) as value,
              min(v.published_at) as published_at
            from video_snapshots s join videos v on v.id = s.video_id join accounts a on a.id = v.account_id
            where s.taken_at > ${iso(lookback)}::timestamptz and s.taken_at <= ${iso(end)}::timestamptz
              and ${scope(f, { account: "a" })}
            group by 1, 2, 3`
      : sql`select a.platform, s.account_id as entity, date_trunc(${u}, s.taken_at) as bucket, max(s.followers) as value,
              null::timestamptz as published_at
            from account_snapshots s join accounts a on a.id = s.account_id
            where s.followers is not null and s.taken_at > ${iso(lookback)}::timestamptz
              and s.taken_at <= ${iso(end)}::timestamptz and ${scope(f, { account: "a" })}
            group by 1, 2, 3`;
  return sql`
    with per as (${per}),
    d as (
      select platform, bucket,
        coalesce(value - lag(value) over (partition by entity order by bucket),
          case when published_at >= bucket - ${sql.raw(`interval '1 ${unit}'`)} then value end) as gain
      from per)
    select platform, bucket, sum(gain) as gain from d
    where bucket >= date_trunc(${u}, ${iso(start)}::timestamptz) and gain is not null
    group by 1, 2 order by 2`;
}

function fillSeries(raw: { platform: string; bucket: string | Date; gain: string | number }[], start: Date, end: Date, unit: "hour" | "day"): SeriesPoint[] {
  const step = unit === "hour" ? 3600_000 : DAY;
  const floor = (d: Date) => {
    const x = new Date(d);
    if (unit === "hour") x.setUTCMinutes(0, 0, 0);
    else x.setUTCHours(0, 0, 0, 0);
    return x.getTime();
  };
  const map = new Map<number, SeriesPoint>();
  for (let t = floor(start); t <= end.getTime(); t += step) map.set(t, { t: new Date(t).toISOString(), youtube: 0, tiktok: 0 });
  for (const r of raw) {
    const p = map.get(new Date(r.bucket).getTime());
    if (p && (r.platform === "youtube" || r.platform === "tiktok")) p[r.platform] += num(r.gain);
  }
  return [...map.values()];
}

export async function getDashboard(db: Db, f: Filters): Promise<Dashboard> {
  // Postgres date_trunc uses the session time zone; keep buckets in UTC.
  await db.execute(sql`set time zone 'UTC'`);
  const now = f.now ?? new Date();
  const span = RANGES[f.range] * DAY;
  const start = new Date(now.getTime() - span);
  const prevStart = new Date(start.getTime() - span);
  const unit = f.range === "24h" ? "hour" : "day";

  const [cur, prev, fol, folPrev, accts, published, publishedPrev, viewsRaw, follRaw, lastPoll] = await Promise.all([
    rows<RawVideo>(db, videoGainsQuery(f, start, now)),
    rows<RawVideo>(db, videoGainsQuery(f, prevStart, start)),
    rows<{ id: number; followers: string | null; gained: string | null }>(db, followerQuery(f, start, now)),
    rows<{ id: number; gained: string | null }>(db, followerQuery(f, prevStart, start)),
    rows<{ id: number; platform: "youtube" | "tiktok"; title: string; handle: string | null; avatar_url: string | null; last_polled_at: string | Date | null; last_error: string | null }>(
      db,
      sql`select a.id, a.platform, a.title, a.handle, a.avatar_url, a.last_polled_at, a.last_error from accounts a where ${scope(f, { account: "a" })} order by a.platform, a.title`,
    ),
    rows<{ account_id: number; n: string }>(
      db,
      sql`select v.account_id, count(*) as n from videos v join accounts a on a.id = v.account_id
          where v.published_at > ${iso(start)}::timestamptz and ${scope(f, { account: "a" })} group by 1`,
    ),
    rows<{ n: string }>(
      db,
      sql`select count(*) as n from videos v join accounts a on a.id = v.account_id
          where v.published_at > ${iso(prevStart)}::timestamptz and v.published_at <= ${iso(start)}::timestamptz
            and ${scope(f, { account: "a" })}`,
    ),
    rows<{ platform: string; bucket: string; gain: string }>(db, seriesQuery("views", f, start, now, unit)),
    rows<{ platform: string; bucket: string; gain: string }>(db, seriesQuery("followers", f, start, now, unit)),
    rows<{ finished_at: string | Date | null; accounts_ok: number; accounts_failed: number }>(
      db,
      sql`select finished_at, accounts_ok, accounts_failed from poll_runs where finished_at is not null order by id desc limit 1`,
    ),
  ]);

  const videos = cur.map(toVideo);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const folById = new Map(fol.map((r) => [r.id, r]));
  const pubById = new Map(published.map((r) => [r.account_id, num(r.n)]));

  const accounts: AccountRow[] = accts.map((a) => {
    const own = videos.filter((v) => v.accountId === a.id);
    const fr = folById.get(a.id);
    return {
      id: a.id,
      platform: a.platform,
      title: a.title,
      handle: a.handle,
      avatarUrl: a.avatar_url,
      followers: fr?.followers == null ? null : num(fr.followers),
      followersGained: fr?.gained == null ? null : num(fr.gained),
      viewsGained: sum(own.map((v) => v.viewsGained)),
      engagementsGained: sum(own.map((v) => v.engagementsGained)),
      videosPublished: pubById.get(a.id) ?? 0,
      lastPolledAt: toIso(a.last_polled_at),
      lastError: a.last_error,
    };
  });

  const prevVideos = prev.map(toVideo);
  return {
    generatedAt: now.toISOString(),
    filters: { range: f.range, platform: f.platform, accountId: f.accountId ?? null },
    lastPoll: lastPoll[0]
      ? { finishedAt: toIso(lastPoll[0].finished_at), accountsOk: lastPoll[0].accounts_ok, accountsFailed: lastPoll[0].accounts_failed }
      : null,
    kpis: {
      followers: sum(accounts.map((a) => a.followers ?? 0)),
      followersGained: sum(fol.map((r) => num(r.gained))),
      followersGainedPrev: sum(folPrev.map((r) => num(r.gained))),
      viewsGained: sum(videos.map((v) => v.viewsGained)),
      viewsGainedPrev: sum(prevVideos.map((v) => v.viewsGained)),
      engagements: sum(videos.map((v) => v.engagementsGained)),
      engagementsPrev: sum(prevVideos.map((v) => v.engagementsGained)),
      videosPublished: sum([...pubById.values()]),
      videosPublishedPrev: num(publishedPrev[0]?.n),
    },
    bucket: unit,
    viewsSeries: fillSeries(viewsRaw, start, now, unit),
    followersSeries: fillSeries(follRaw, start, now, unit),
    accounts,
    topVideos: [...videos].sort((a, b) => b.viewsGained - a.viewsGained).slice(0, 25),
  };
}

export interface LibraryQuery {
  platform: PlatformFilter;
  accountId?: number | null;
  q?: string;
  sort: "newest" | "views" | "trending";
  page: number;
  pageSize?: number;
  now?: Date;
}

/** Video library grid: every tracked video with its latest numbers and 24h gain. */
export async function getLibrary(db: Db, query: LibraryQuery): Promise<{ total: number; items: VideoRow[] }> {
  const now = query.now ?? new Date();
  const f: Filters = { range: "24h", platform: query.platform, accountId: query.accountId };
  const pageSize = Math.min(query.pageSize ?? 24, 60);
  const offset = Math.max(0, (query.page - 1) * pageSize);
  const search = query.q?.trim() ? sql`and g.title ilike ${"%" + query.q.trim().replace(/[%_\\]/g, "\\$&") + "%"}` : sql``;
  const order =
    query.sort === "views" ? sql`g.views desc` : query.sort === "trending" ? sql`g.views_gained desc` : sql`g.published_at desc nulls last`;
  const base = videoGainsQuery(f, new Date(now.getTime() - DAY), now);
  const [items, total] = await Promise.all([
    rows<RawVideo>(db, sql`select * from (${base}) g where true ${search} order by ${order}, g.id desc limit ${pageSize} offset ${offset}`),
    rows<{ n: string }>(db, sql`select count(*) as n from (${base}) g where true ${search}`),
  ]);
  return { total: num(total[0]?.n), items: items.map(toVideo) };
}
