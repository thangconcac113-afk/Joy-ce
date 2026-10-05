import { desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pollRuns } from "@/db/schema";

/** Minimum gap between polls, to protect the YouTube quota (10,000 units/day). */
export const MIN_POLL_GAP_MS = 2 * 60 * 1000;

export async function recentlyPolled(db: Db, now = new Date()): Promise<boolean> {
  const [last] = await db.select({ startedAt: pollRuns.startedAt }).from(pollRuns).orderBy(desc(pollRuns.id)).limit(1);
  return !!last && now.getTime() - last.startedAt.getTime() < MIN_POLL_GAP_MS;
}
