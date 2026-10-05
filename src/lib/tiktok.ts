// TikTok for Developers: Login Kit (OAuth v2) + Display API.
// Scopes: user.info.basic, user.info.stats, video.list.
// Each Team Secret TikTok account authorises once; refresh tokens last ~365 days.

import type { FetchFn } from "./youtube";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
export const TIKTOK_SCOPES = "user.info.basic,user.info.stats,video.list";

export class TikTokError extends Error {}

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface TikTokUser {
  openId: string;
  displayName: string;
  avatarUrl: string | null;
  followers: number | null;
  likes: number | null;
  videoCount: number | null;
}

export interface TikTokVideo {
  id: string;
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export function tiktokConfig(): TikTokConfig | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) return null;
  return { clientKey, clientSecret, redirectUri };
}

export function buildAuthUrl(cfg: TikTokConfig, state: string): string {
  const qs = new URLSearchParams({
    client_key: cfg.clientKey,
    scope: TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `${AUTH_URL}?${qs}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>, fetchFn: FetchFn, now: Date): Promise<TikTokTokens> {
  const res = await fetchFn(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error || !json.access_token || !json.refresh_token || !json.open_id) {
    throw new TikTokError(`TikTok token request failed: ${json.error_description ?? json.error ?? res.status}`);
  }
  const t = now.getTime();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    openId: json.open_id,
    accessTokenExpiresAt: new Date(t + (json.expires_in ?? 86400) * 1000),
    refreshTokenExpiresAt: new Date(t + (json.refresh_expires_in ?? 31536000) * 1000),
  };
}

export function exchangeCode(cfg: TikTokConfig, code: string, fetchFn: FetchFn = fetch, now = new Date()) {
  return tokenRequest(
    {
      client_key: cfg.clientKey,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: cfg.redirectUri,
    },
    fetchFn,
    now,
  );
}

export function refreshTokens(cfg: TikTokConfig, refreshToken: string, fetchFn: FetchFn = fetch, now = new Date()) {
  return tokenRequest(
    {
      client_key: cfg.clientKey,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    fetchFn,
    now,
  );
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

async function api<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || (json.error?.code && json.error.code !== "ok") || !json.data) {
    throw new TikTokError(`TikTok API ${res.status}: ${json.error?.message || json.error?.code || "request failed"}`);
  }
  return json.data;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Only https URLs reach the UI as links or images. */
const httpsUrl = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v) ? v : null);

export async function fetchUser(accessToken: string, fetchFn: FetchFn = fetch): Promise<TikTokUser> {
  const fields = "open_id,avatar_url,display_name,follower_count,likes_count,video_count";
  const data = await api<{ user?: Record<string, unknown> }>(
    await fetchFn(`${API}/user/info/?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
  );
  const u = data.user ?? {};
  return {
    openId: String(u.open_id ?? ""),
    displayName: String(u.display_name ?? "TikTok account"),
    avatarUrl: httpsUrl(u.avatar_url),
    followers: n(u.follower_count),
    likes: n(u.likes_count),
    videoCount: n(u.video_count),
  };
}

/** Newest videos first; pages of 20 (the API maximum). */
export async function fetchVideos(accessToken: string, limit = 40, fetchFn: FetchFn = fetch): Promise<TikTokVideo[]> {
  const fields =
    "id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count";
  const out: TikTokVideo[] = [];
  let cursor: number | undefined;
  while (out.length < limit) {
    const data = await api<{ videos?: Record<string, unknown>[]; cursor?: number; has_more?: boolean }>(
      await fetchFn(`${API}/video/list/?fields=${fields}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(cursor === undefined ? { max_count: 20 } : { max_count: 20, cursor }),
      }),
    );
    for (const v of data.videos ?? []) {
      const created = n(v.create_time);
      const title = String(v.title || v.video_description || "").trim();
      out.push({
        id: String(v.id),
        title: title || "Untitled TikTok",
        url: httpsUrl(v.share_url),
        thumbnailUrl: httpsUrl(v.cover_image_url),
        publishedAt: created ? new Date(created * 1000).toISOString() : null,
        durationSec: n(v.duration),
        views: n(v.view_count) ?? 0,
        likes: n(v.like_count),
        comments: n(v.comment_count),
        shares: n(v.share_count),
      });
    }
    if (!data.has_more || data.cursor === undefined) break;
    cursor = data.cursor;
  }
  return out.slice(0, limit);
}
