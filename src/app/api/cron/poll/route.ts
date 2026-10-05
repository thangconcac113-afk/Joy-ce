import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { jsonError } from "@/lib/api";
import { pollAll } from "@/lib/poll";
import { recentlyPolled } from "@/lib/pollGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Scheduler entry point (Vercel Cron, GitHub Actions, cron-job.org...). */
async function handle(req: Request) {
  if (!authorised(req)) return jsonError("Unauthorised.", 401);
  try {
    const db = await getDb();
    if (await recentlyPolled(db)) return NextResponse.json({ skipped: "polled recently" });
    return NextResponse.json(await pollAll(db));
  } catch (e) {
    console.error(e);
    return jsonError(e instanceof Error ? e.message : "Poll failed.", 500);
  }
}

export const GET = handle;
export const POST = handle;
