// YouTube Data API v3 (public statistics). Quota per poll per channel:
// channels.list 1 + playlistItems.list 1 + videos.list 1 per 50 videos.

const BASE = "https://www.googleapis.com/youtube/v3";

export type FetchFn = typeof fetch;

export interface YtChannel {
  id: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  uploadsPlaylistId: string | null;
  subscribers: number | null;
  totalViews: number | null;
  videoCount: number | null;
}

export interface YtVideo {
  id: string;
  title: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  views: number;
  likes: number | null;
  comments: number | null;
}

export class YouTubeError extends Error {}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function call<T>(path: string, params: Record<string, string>, apiKey: string, fetchFn: FetchFn): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetchFn(`${BASE}/${path}?${qs}`);
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new YouTubeError(`YouTube ${path} ${res.status}: ${body.error?.message ?? "request failed"}`);
  return body as T;
}

/** Accepts @handle, a channel ID (UC...), or a youtube.com URL in either form. */
export function parseChannelInput(input: string): { id: string } | { handle: string } {
  const s = input.trim();
  const fromUrl = s.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|(@[\w.-]+))/i);
  if (fromUrl?.[1]) return { id: fromUrl[1] };
  if (fromUrl?.[2]) return { handle: fromUrl[2] };
  if (/^UC[\w-]{22}$/.test(s)) return { id: s };
  if (/^@?[\w.-]{3,}$/.test(s)) return { handle: s.startsWith("@") ? s : `@${s}` };
  throw new YouTubeError("Enter a channel @handle, channel ID (UC...) or channel URL.");
}

interface RawChannel {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

function toChannel(c: RawChannel): YtChannel {
  return {
    id: c.id,
    title: c.snippet?.title ?? c.id,
    handle: c.snippet?.customUrl ?? null,
    avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : num(c.statistics?.subscriberCount),
    totalViews: num(c.statistics?.viewCount),
    videoCount: num(c.statistics?.videoCount),
  };
}

const CHANNEL_PARTS = "snippet,statistics,contentDetails";

export async function resolveChannel(input: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<YtChannel> {
  const parsed = parseChannelInput(input);
  const params: Record<string, string> =
    "id" in parsed ? { part: CHANNEL_PARTS, id: parsed.id } : { part: CHANNEL_PARTS, forHandle: parsed.handle };
  const res = await call<{ items?: RawChannel[] }>("channels", params, apiKey, fetchFn);
  const first = res.items?.[0];
  if (!first) throw new YouTubeError(`Channel "${input}" not found.`);
  return toChannel(first);
}

/** Batch lookup, up to 50 IDs per request. */
export async function fetchChannels(ids: string[], apiKey: string, fetchFn: FetchFn = fetch): Promise<YtChannel[]> {
  const out: YtChannel[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await call<{ items?: RawChannel[] }>(
      "channels",
      { part: CHANNEL_PARTS, id: ids.slice(i, i + 50).join(","), maxResults: "50" },
      apiKey,
      fetchFn,
    );
    out.push(...(res.items ?? []).map(toChannel));
  }
  return out;
}

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function parseDuration(iso: string | undefined): number | null {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

/** Most recent uploads (newest first) with their current statistics. */
export async function fetchRecentVideos(
  uploadsPlaylistId: string,
  apiKey: string,
  limit = 50,
  fetchFn: FetchFn = fetch,
): Promise<YtVideo[]> {
  const list = await call<{ items?: { contentDetails?: { videoId?: string } }[] }>(
    "playlistItems",
    { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: String(Math.min(limit, 50)) },
    apiKey,
    fetchFn,
  );
  const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => !!v);
  if (ids.length === 0) return [];
  const res = await call<{
    items?: {
      id: string;
      snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }[];
  }>("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") }, apiKey, fetchFn);
  return (res.items ?? []).map((v) => ({
    id: v.id,
    title: v.snippet?.title ?? v.id,
    publishedAt: v.snippet?.publishedAt ?? null,
    thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? null,
    durationSec: parseDuration(v.contentDetails?.duration),
    views: num(v.statistics?.viewCount) ?? 0,
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
  }));
}
