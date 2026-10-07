import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { jsonError } from "@/lib/api";
import { getSheetVideos, monthly } from "@/lib/sheetExport";

export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.SHEET_EXPORT_KEY;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Read-only feed for the Google Sheet's Apps Script. Protected by its own key, separate from the cron secret. */
export async function GET(req: Request) {
  if (!process.env.SHEET_EXPORT_KEY) return jsonError("SHEET_EXPORT_KEY is not configured on the server.", 503);
  if (!authorised(req)) return jsonError("Unauthorised.", 401);
  const d = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(d) && d >= 7 && d <= 730 ? Math.floor(d) : 400;
  const videos = await getSheetVideos(await getDb(), days);
  return NextResponse.json({ generatedAt: new Date().toISOString(), days, videos, monthly: monthly(videos) });
}
