// YouTube Analytics API (owner-only metrics: average view duration, impressions CTR).
// A channel manager authorises once with the same Google OAuth client used for sign-in.
// Scopes are read-only. Google refresh tokens do not expire, so only the refresh token is stored (encrypted).

import type { FetchFn } from "./youtube";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REPORTS = "https://youtubeanalytics.googleapis.com/v2/reports";
const CHANNELS = "https://www.googleapis.com/youtube/v3/channels";
export const ANALYTICS_SCOPES = "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly";

export class AnalyticsError extends Error {}

export interface AnalyticsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function analyticsConfig(origin: string): AnalyticsConfig | null {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${origin}/api/youtube/callback` };
}

export function buildAuthUrl(cfg: AnalyticsConfig, state: string): string {
  const qs = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: ANALYTICS_SCOPES,
    access_type: "offline",
    // select_account lets a manager pick the Brand Account that owns the channel; consent forces a refresh token.
    prompt: "select_account consent",
    state,
  });
  return `${AUTH_URL}?${qs}`;
}

async function token(body: Record<string, string>, fetchFn: FetchFn) {
  const res = await fetchFn(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new AnalyticsError(`Google token request failed: ${json.error_description ?? json.error ?? res.status}`);
  return json as { access_token: string; refresh_token?: string };
}

export function exchangeCode(cfg: AnalyticsConfig, code: string, fetchFn: FetchFn = fetch) {
  return token({ client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code", code }, fetchFn);
}

export async function refreshAccessToken(cfg: Pick<AnalyticsConfig, "clientId" | "clientSecret">, refreshToken: string, fetchFn: FetchFn = fetch) {
  return (await token({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn)).access_token;
}

/** The channel the signed-in Google account (or the Brand Account it picked) owns. */
export async function myChannelId(accessToken: string, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await fetchFn(`${CHANNELS}?part=id&mine=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as { items?: { id: string }[]; error?: { message?: string } };
  const id = json.items?.[0]?.id;
  if (!res.ok || !id) throw new AnalyticsError(json.error?.message ?? "This Google account has no YouTube channel. Pick the channel's Brand Account.");
  return id;
}

export interface Stats {
  views: number | null;
  impressions: number | null;
  /** Percent, as returned by YouTube (5.2 means 5.2%). */
  ctr: number | null;
  avdSec: number | null;
  avgViewPct: number | null;
}

type Row = Record<string, number | string>;

async function report(accessToken: string, channelId: string, params: Record<string, string>, fetchFn: FetchFn): Promise<Row[]> {
  const qs = new URLSearchParams({ ids: `channel==${channelId}`, ...params });
  const res = await fetchFn(`${REPORTS}?${qs}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as { columnHeaders?: { name: string }[]; rows?: (number | string)[][]; error?: { message?: string } };
  if (!res.ok) throw new AnalyticsError(`YouTube Analytics ${res.status}: ${json.error?.message ?? "request failed"}`);
  const names = (json.columnHeaders ?? []).map((h) => h.name);
  return (json.rows ?? []).map((r) => Object.fromEntries(r.map((v, i) => [names[i], v])));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const day = (d: Date) => d.toISOString().slice(0, 10);
const CORE = "views,averageViewDuration,averageViewPercentage";
const IMPRESSIONS = "videoThumbnailImpressions,videoThumbnailImpressionsClickRate";

function toStats(core: Row | undefined, imp: Row | undefined): Stats {
  return {
    views: num(core?.views),
    avdSec: num(core?.averageViewDuration),
    avgViewPct: num(core?.averageViewPercentage),
    impressions: num(imp?.videoThumbnailImpressions),
    ctr: num(imp?.videoThumbnailImpressionsClickRate),
  };
}

/** Impressions metrics are fetched separately: if YouTube refuses them for a channel, AVD still works. */
async function optional(run: () => Promise<Row[]>): Promise<Row[]> {
  try {
    return await run();
  } catch {
    return [];
  }
}

export async function fetchChannelStats(accessToken: string, channelId: string, days: number, now = new Date(), fetchFn: FetchFn = fetch): Promise<Stats> {
  const range = { startDate: day(new Date(now.getTime() - days * 86400_000)), endDate: day(now) };
  const core = await report(accessToken, channelId, { ...range, metrics: CORE }, fetchFn);
  const imp = await optional(() => report(accessToken, channelId, { ...range, metrics: IMPRESSIONS }, fetchFn));
  return toStats(core[0], imp[0]);
}

/** Per-video stats for the channel's best 200 videos in the window, keyed by YouTube video id. */
export async function fetchVideoStats(accessToken: string, channelId: string, days: number, now = new Date(), fetchFn: FetchFn = fetch): Promise<Map<string, Stats>> {
  const range = { startDate: day(new Date(now.getTime() - days * 86400_000)), endDate: day(now), dimensions: "video", maxResults: "200" };
  const core = await report(accessToken, channelId, { ...range, metrics: CORE, sort: "-views" }, fetchFn);
  const imp = await optional(() => report(accessToken, channelId, { ...range, metrics: IMPRESSIONS, sort: "-videoThumbnailImpressions" }, fetchFn));
  const impById = new Map(imp.map((r) => [String(r.video), r]));
  return new Map(core.map((r) => [String(r.video), toStats(r, impById.get(String(r.video)))]));
}
