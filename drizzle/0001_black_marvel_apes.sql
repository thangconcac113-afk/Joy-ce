CREATE TABLE "channel_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"range_key" text NOT NULL,
	"views" bigint,
	"impressions" bigint,
	"ctr" real,
	"avd_sec" real,
	"avg_view_pct" real,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_analytics" (
	"video_id" integer PRIMARY KEY NOT NULL,
	"views" bigint,
	"impressions" bigint,
	"ctr" real,
	"avd_sec" real,
	"avg_view_pct" real,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "analytics_error" text;--> statement-breakpoint
ALTER TABLE "channel_analytics" ADD CONSTRAINT "channel_analytics_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analytics" ADD CONSTRAINT "video_analytics_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_analytics_uq" ON "channel_analytics" USING btree ("account_id","range_key");