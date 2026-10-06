import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseFilters, withUser } from "@/lib/api";
import { getLatestUploads } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withUser(async () => {
    const f = parseFilters(new URL(req.url));
    return NextResponse.json({ items: await getLatestUploads(await getDb(), f) });
  });
}
