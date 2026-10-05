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
  /** YouTube Analytics (owner-only), last 28 days. Null until the channel manager connects Analytics. */
  avdSec: number | null;
  ctr: number | null;
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
  /** Earliest snapshot in scope: before this, growth can't be measured. */
  trackingSince: string | null;
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
  /** Owner-only YouTube Analytics for the selected channels. 24h uses the 7-day window (Analytics is daily). */
  analytics: { rangeKey: "7d" | "30d" | "90d"; avdSec: number | null; ctr: number | null; impressions: number | null; connected: number; total: number };
  bucket: "hour" | "day";
  viewsSeries: SeriesPoint[];
  followersSeries: SeriesPoint[];
  /** Views gained per bucket for each account (keys are account ids). */
  accountViewsSeries: Record<number, number[]>;
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
      last.views, last.likes, last.comments, last.shares, va.avd_sec, va.ctr,
      greatest(last.views - coalesce(base.views,
        case when v.published_at >= ${iso(start)}::timestamptz then 0 end, first.views, last.views), 0) as views_gained,
      greatest(
        (coalesce(last.likes,0) + coalesce(last.comments,0) + coalesce(last.shares,0)) -
        coalesce(base.eng, case when v.published_at >= ${iso(start)}::timestamptz then 0 end, first.eng,
          coalesce(last.likes,0) + coalesce(last.comments,0) + coalesce(last.shares,0)), 0) as engagements_gained
    from videos v
    join accounts a on a.id = v.account_id
    left join video_analytics va on va.video_id = v.id
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
  avd_sec: number | null;
  ctr: number | null;
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
    avdSec: r.avd_sec ?? null,
    ctr: r.ctr ?? null,
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
      ? sql`select a.platform, a.id as account_id, s.video_id as entity, date_trunc(${u}, s.taken_at) as bucket, max(s.views) as value,
              min(v.published_at) as published_at
            from video_snapshots s join videos v on v.id = s.video_id join accounts a on a.id = v.account_id
            where s.taken_at > ${iso(lookback)}::timestamptz and s.taken_at <= ${iso(end)}::timestamptz
              and ${scope(f, { account: "a" })}
            group by 1, 2, 3, 4`
      : sql`select a.platform, a.id as account_id, s.account_id as entity, date_trunc(${u}, s.taken_at) as bucket, max(s.followers) as value,
              null::timestamptz as published_at
            from account_snapshots s join accounts a on a.id = s.account_id
            where s.followers is not null and s.taken_at > ${iso(lookback)}::timestamptz
              and s.taken_at <= ${iso(end)}::timestamptz and ${scope(f, { account: "a" })}
            group by 1, 2, 3, 4`;
  return sql`
    with per as (${per}),
    d as (
      select platform, account_id, bucket,
        coalesce(value - lag(value) over (partition by entity order by bucket),
          case when published_at >= bucket - ${sql.raw(`interval '1 ${unit}'`)} then value end) as gain
      from per)
    select platform, account_id, bucket, sum(gain) as gain from d
    where bucket >= date_trunc(${u}, ${iso(start)}::timestamptz) and gain is not null
    group by 1, 2, 3 order by 3`;
}

interface SeriesRaw {
  platform: string;
  account_id: number;
  bucket: string | Date;
  gain: string | number;
}

/** Per-account gains aligned to the same buckets as the platform series. */
function accountSeries(raw: SeriesRaw[], points: SeriesPoint[]): Record<number, number[]> {
  const index = new Map(points.map((p, i) => [new Date(p.t).getTime(), i]));
  const out: Record<number, number[]> = {};
  for (const r of raw) {
    const i = index.get(new Date(r.bucket).getTime());
    if (i === undefined) continue;
    (out[r.account_id] ??= new Array(points.length).fill(0))[i] += num(r.gain);
  }
  return out;
}

function fillSeries(raw: SeriesRaw[], start: Date, end: Date, unit: "hour" | "day"): SeriesPoint[] {
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

const analyticsKey = (r: RangeKey) => (r === "24h" ? "7d" : r);

/** AVD is weighted by views and CTR by impressions, so a big channel counts for more than a small one. */
function analyticsSummary(range: RangeKey, rs: { views: number | null; impressions: number | null; ctr: number | null; avd_sec: number | null }[], total: number): Dashboard["analytics"] {
  const weighted = (value: (r: (typeof rs)[number]) => number | null, weight: (r: (typeof rs)[number]) => number | null) => {
    let sum = 0;
    let w = 0;
    for (const r of rs) {
      const v = value(r);
      const x = weight(r);
      if (v == null || !x) continue;
      sum += v * num(x);
      w += num(x);
    }
    return w ? sum / w : null;
  };
  const impressions = rs.some((r) => r.impressions != null) ? rs.reduce((s, r) => s + num(r.impressions), 0) : null;
  return {
    rangeKey: analyticsKey(range),
    avdSec: weighted((r) => r.avd_sec, (r) => r.views),
    ctr: weighted((r) => r.ctr, (r) => r.impressions),
    impressions,
    connected: rs.length,
    total,
  };
}

export async function getDashboard(db: Db, f: Filters): Promise<Dashboard> {
  // Postgres date_trunc uses the session time zone; keep buckets in UTC.
  await db.execute(sql`set time zone 'UTC'`);
  const now = f.now ?? new Date();
  const span = RANGES[f.range] * DAY;
  const start = new Date(now.getTime() - span);
  const prevStart = new Date(start.getTime() - span);
  const unit = f.range === "24h" ? "hour" : "day";

  const [cur, prev, fol, folPrev, accts, published, publishedPrev, viewsRaw, follRaw, lastPoll, since, anRows] = await Promise.all([
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
    rows<SeriesRaw>(db, seriesQuery("views", f, start, now, unit)),
    rows<SeriesRaw>(db, seriesQuery("followers", f, start, now, unit)),
    rows<{ finished_at: string | Date | null; accounts_ok: number; accounts_failed: number }>(
      db,
      sql`select finished_at, accounts_ok, accounts_failed from poll_runs where finished_at is not null order by id desc limit 1`,
    ),
    rows<{ t: string | Date | null }>(
      db,
      sql`select min(s.taken_at) as t from account_snapshots s join accounts a on a.id = s.account_id where ${scope(f, { account: "a" })}`,
    ),
    rows<{ views: number | null; impressions: number | null; ctr: number | null; avd_sec: number | null }>(
      db,
      sql`select ca.views, ca.impressions, ca.ctr, ca.avd_sec from channel_analytics ca join accounts a on a.id = ca.account_id
          where ca.range_key = ${analyticsKey(f.range)} and ${scope(f, { account: "a" })}`,
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
  const viewsSeries = fillSeries(viewsRaw, start, now, unit);
  return {
    generatedAt: now.toISOString(),
    filters: { range: f.range, platform: f.platform, accountId: f.accountId ?? null },
    lastPoll: lastPoll[0]
      ? { finishedAt: toIso(lastPoll[0].finished_at), accountsOk: lastPoll[0].accounts_ok, accountsFailed: lastPoll[0].accounts_failed }
      : null,
    trackingSince: toIso(since[0]?.t ?? null),
    analytics: analyticsSummary(f.range, anRows, accts.filter((a) => a.platform === "youtube").length),
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
    viewsSeries,
    followersSeries: fillSeries(follRaw, start, now, unit),
    accountViewsSeries: accountSeries(viewsRaw, viewsSeries),
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
