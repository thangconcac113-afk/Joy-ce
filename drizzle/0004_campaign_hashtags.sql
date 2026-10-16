ALTER TABLE "videos" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hashtags" text[] DEFAULT '{}' NOT NULL;
