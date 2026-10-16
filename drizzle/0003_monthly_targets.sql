CREATE TABLE "monthly_goals" (
	"month" text PRIMARY KEY NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"followers" bigint DEFAULT 0 NOT NULL,
	"publications" integer DEFAULT 0 NOT NULL
);
