import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accounts, accountSnapshots, oauthStates, pollRuns, videos, videoSnapshots, type Account, type Platform } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { fetchVideos, fetchUser, refreshTokens, tiktokConfig, type TikTokConfig } from "./tiktok";
import { fetchChannels, fetchRecentVideos, type FetchFn } from "./youtube";

export interface PollOptions {
  now?: Date;
  fetchFn?: FetchFn;
  youtubeApiKey?: string;
  tiktok?: TikTokConfig | null;
  /** Recent videos tracked per account. */
  videosPerAccount?: number;
}

export interface PollResult {
  accountsOk: number;
  accountsFailed: number;
  videosUpdated: number;
  errors: { accountId: number; title: string; error: string }[];
}

interface VideoInput {
  id: string;
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  views: number;
  likes: number | null;
  comments: number | null;
  shares?: number | null;
}

async function recordVideos(db: Db, account: Account, list: VideoInput[], now: Date): Promise<number> {
  if (list.length === 0) return 0;
  const rows = await db
    .insert(videos)
    .values(
      list.map((v) => ({
        accountId: account.id,
        platform: account.platform,
        externalId: v.id,
        title: v.title,
        url: v.url,
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
        durationSec: v.durationSec,
      })),
    )
    .onConflictDoUpdate({
      target: [videos.platform, videos.externalId],
      set: {
        title: sqlExcluded("title"),
        url: sqlExcluded("url"),
        thumbnailUrl: sqlExcluded("thumbnail_url"),
        durationSec: sqlExcluded("duration_sec"),
      },
    })
    .returning({ id: videos.id, externalId: videos.externalId });
  const idByExternal = new Map(rows.map((r) => [r.externalId, r.id]));
  await db.insert(videoSnapshots).values(
    list.map((v) => ({
      videoId: idByExternal.get(v.id)!,
      takenAt: now,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares ?? null,
    })),
  );
  return list.length;
}

// drizzle has no helper for EXCLUDED.<col>; keep the raw SQL in one place.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

async function pollYouTube(db: Db, list: Account[], opts: Required<Pick<PollOptions, "fetchFn" | "videosPerAccount">> & { apiKey: string; now: Date }, result: PollResult) {
  if (list.length === 0) return;
  const channels = await fetchChannels(list.map((a) => a.externalId), opts.apiKey, opts.fetchFn);
  const byId = new Map(channels.map((c) => [c.id, c]));
  for (const account of list) {
    try {
      const ch = byId.get(account.externalId);
      if (!ch) throw new Error("Channel not returned by YouTube (deleted or private?).");
      await db.insert(accountSnapshots).values({
        accountId: account.id,
        takenAt: opts.now,
        followers: ch.subscribers,
        totalViews: ch.totalViews,
        videoCount: ch.videoCount,
      });
      const uploads = ch.uploadsPlaylistId ?? account.uploadsPlaylistId;
      const vids = uploads ? await fetchRecentVideos(uploads, opts.apiKey, opts.videosPerAccount, opts.fetchFn) : [];
      result.videosUpdated += await recordVideos(
        db,
        account,
        vids.map((v) => ({ ...v, url: `https://www.youtube.com/watch?v=${v.id}` })),
        opts.now,
      );
      await db
        .update(accounts)
        .set({ title: ch.title, handle: ch.handle, avatarUrl: ch.avatarUrl, uploadsPlaylistId: uploads, lastPolledAt: opts.now, lastError: null })
        .where(eq(accounts.id, account.id));
      result.accountsOk++;
    } catch (e) {
      await fail(db, account, e, result);
    }
  }
}

/** Returns a usable access token, refreshing (and persisting) it when close to expiry. */
async function tiktokAccessToken(db: Db, account: Account, cfg: TikTokConfig, fetchFn: FetchFn, now: Date): Promise<string> {
  if (!account.accessTokenEnc || !account.refreshTokenEnc) throw new Error("TikTok account is not connected.");
  const expires = account.accessTokenExpiresAt?.getTime() ?? 0;
  if (expires - now.getTime() > 10 * 60 * 1000) return decrypt(account.accessTokenEnc);
  if (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt.getTime() <= now.getTime()) {
    throw new Error("TikTok authorisation expired. Reconnect this account.");
  }
  const t = await refreshTokens(cfg, decrypt(account.refreshTokenEnc), fetchFn, now);
  await db
    .update(accounts)
    .set({
      accessTokenEnc: encrypt(t.accessToken),
      refreshTokenEnc: encrypt(t.refreshToken),
      accessTokenExpiresAt: t.accessTokenExpiresAt,
      refreshTokenExpiresAt: t.refreshTokenExpiresAt,
    })
    .where(eq(accounts.id, account.id));
  return t.accessToken;
}

async function pollTikTok(db: Db, list: Account[], cfg: TikTokConfig, fetchFn: FetchFn, limit: number, now: Date, result: PollResult) {
  for (const account of list) {
    try {
      const token = await tiktokAccessToken(db, account, cfg, fetchFn, now);
      const user = await fetchUser(token, fetchFn);
      const vids = await fetchVideos(token, limit, fetchFn);
      await db.insert(accountSnapshots).values({
        accountId: account.id,
        takenAt: now,
        followers: user.followers,
        totalLikes: user.likes,
        videoCount: user.videoCount,
      });
      result.videosUpdated += await recordVideos(db, account, vids, now);
      await db
        .update(accounts)
        .set({ title: user.displayName, avatarUrl: user.avatarUrl, lastPolledAt: now, lastError: null })
        .where(eq(accounts.id, account.id));
      result.accountsOk++;
    } catch (e) {
      await fail(db, account, e, result);
    }
  }
}

async function fail(db: Db, account: Account, e: unknown, result: PollResult) {
  const msg = e instanceof Error ? e.message : String(e);
  result.accountsFailed++;
  result.errors.push({ accountId: account.id, title: account.title, error: msg });
  await db.update(accounts).set({ lastError: msg.slice(0, 500) }).where(eq(accounts.id, account.id));
}

export async function pollAll(db: Db, options: PollOptions = {}): Promise<PollResult> {
  const now = options.now ?? new Date();
  const fetchFn = options.fetchFn ?? fetch;
  const videosPerAccount = options.videosPerAccount ?? 50;
  const apiKey = options.youtubeApiKey ?? process.env.YOUTUBE_API_KEY;
  const tt = options.tiktok === undefined ? tiktokConfig() : options.tiktok;
  const result: PollResult = { accountsOk: 0, accountsFailed: 0, videosUpdated: 0, errors: [] };

  const [run] = await db.insert(pollRuns).values({ startedAt: now }).returning({ id: pollRuns.id });
  const all = await db.select().from(accounts);
  const byPlatform = (p: Platform) => all.filter((a) => a.platform === p);

  const yt = byPlatform("youtube");
  if (yt.length) {
    if (!apiKey) {
      for (const a of yt) await fail(db, a, new Error("YOUTUBE_API_KEY is not set."), result);
    } else {
      try {
        await pollYouTube(db, yt, { apiKey, fetchFn, videosPerAccount, now }, result);
      } catch (e) {
        // A failed batch lookup (bad key, quota exceeded) fails every YouTube account.
        for (const a of yt) await fail(db, a, e, result);
      }
    }
  }

  const tk = byPlatform("tiktok");
  if (tk.length) {
    if (!tt) for (const a of tk) await fail(db, a, new Error("TikTok app credentials are not set."), result);
    else await pollTikTok(db, tk, tt, fetchFn, Math.min(videosPerAccount, 60), now, result);
  }

  await db
    .update(pollRuns)
    .set({ finishedAt: new Date(), accountsOk: result.accountsOk, accountsFailed: result.accountsFailed, videosUpdated: result.videosUpdated })
    .where(eq(pollRuns.id, run.id));
  // Expired OAuth states are useless; keep the table small.
  await db.delete(oauthStates).where(lt(oauthStates.createdAt, new Date(now.getTime() - 15 * 60 * 1000)));
  return result;
}


