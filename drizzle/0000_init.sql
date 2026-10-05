CREATE TYPE "public"."platform" AS ENUM('youtube', 'tiktok');--> statement-breakpoint
CREATE TABLE "account_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"followers" bigint,
	"total_views" bigint,
	"total_likes" bigint,
	"video_count" integer
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"handle" text,
	"avatar_url" text,
	"uploads_playlist_id" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"accounts_ok" integer DEFAULT 0 NOT NULL,
	"accounts_failed" integer DEFAULT 0 NOT NULL,
	"videos_updated" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"views" bigint NOT NULL,
	"likes" bigint,
	"comments" bigint,
	"shares" bigint
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"thumbnail_url" text,
	"published_at" timestamp with time zone,
	"duration_sec" integer
);
--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_snapshots" ADD CONSTRAINT "video_snapshots_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_snapshots_account_taken_idx" ON "account_snapshots" USING btree ("account_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_platform_external_uq" ON "accounts" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "video_snapshots_video_taken_idx" ON "video_snapshots" USING btree ("video_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_platform_external_uq" ON "videos" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "videos_account_idx" ON "videos" USING btree ("account_id");