import { NextResponse } from "next/server";
import { currentUser } from "@/auth";
import type { PlatformFilter, RangeKey } from "./metrics";
import { RANGES } from "./metrics";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Runs the handler only for an allow-listed user; every API error is JSON. */
export async function withUser(handler: () => Promise<Response>): Promise<Response> {
  const user = await currentUser();
  if (!user) return jsonError("Not signed in.", 401);
  try {
    return await handler();
  } catch (e) {
    console.error(e);
    return jsonError(e instanceof Error ? e.message : "Unexpected error.", 500);
  }
}

export function parseFilters(url: URL) {
  const r = url.searchParams.get("range");
  const p = url.searchParams.get("platform");
  const a = Number(url.searchParams.get("account"));
  return {
    range: (r && r in RANGES ? r : "7d") as RangeKey,
    platform: (p === "youtube" || p === "tiktok" ? p : "all") as PlatformFilter,
    accountId: Number.isInteger(a) && a > 0 ? a : null,
  };
}
