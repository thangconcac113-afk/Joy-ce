import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { jsonError, withUser } from "@/lib/api";
import { pollAll } from "@/lib/poll";
import { recentlyPolled } from "@/lib/pollGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Sync now" from the UI, rate-limited so clicks can't burn the API quota. */
export function POST() {
  return withUser(async () => {
    const db = await getDb();
    if (await recentlyPolled(db)) return jsonError("Synced less than 2 minutes ago. Try again shortly.", 429);
    return NextResponse.json(await pollAll(db));
  });
}
