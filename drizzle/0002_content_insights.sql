ALTER TABLE "accounts" ADD COLUMN "catalog_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "game" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "campaign" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "editor" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "notes" text;