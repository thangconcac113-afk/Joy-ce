import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", ["youtube", "tiktok"]);

/** A tracked YouTube channel or TikTok account. */
export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    /** YouTube channel ID (UC...) or TikTok open_id. */
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    handle: text("handle"),
    avatarUrl: text("avatar_url"),
    /** YouTube only: the channel's uploads playlist. */
    uploadsPlaylistId: text("uploads_playlist_id"),
    /** TikTok only: OAuth tokens, encrypted at rest (see lib/crypto.ts). */
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_platform_external_uq").on(t.platform, t.externalId)],
);

/** Account-level counters captured on every poll. */
export const accountSnapshots = pgTable(
  "account_snapshots",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    followers: bigint("followers", { mode: "number" }),
    totalViews: bigint("total_views", { mode: "number" }),
    totalLikes: bigint("total_likes", { mode: "number" }),
    videoCount: integer("video_count"),
  },
  (t) => [index("account_snapshots_account_taken_idx").on(t.accountId, t.takenAt)],
);

export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
  },
  (t) => [
    uniqueIndex("videos_platform_external_uq").on(t.platform, t.externalId),
    index("videos_account_idx").on(t.accountId),
  ],
);

/** Per-video counters captured on every poll; the source of "views gained". */
export const videoSnapshots = pgTable(
  "video_snapshots",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
  },
  (t) => [index("video_snapshots_video_taken_idx").on(t.videoId, t.takenAt)],
);

/** One row per poll run, so the UI can show freshness and failures. */
export const pollRuns = pgTable("poll_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  accountsOk: integer("accounts_ok").notNull().default(0),
  accountsFailed: integer("accounts_failed").notNull().default(0),
  videosUpdated: integer("videos_updated").notNull().default(0),
});

/** Short-lived OAuth state for the TikTok connect flow (CSRF protection). */
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type Platform = (typeof platformEnum.enumValues)[number];
