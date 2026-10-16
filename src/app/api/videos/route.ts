import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseFilters, withUser } from "@/lib/api";
import { getLibrary } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withUser(async () => {
    const url = new URL(req.url);
    const f = parseFilters(url);
    const s = url.searchParams.get("sort");
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    return NextResponse.json(
      await getLibrary(await getDb(), {
        platform: f.platform,
        accountId: f.accountId,
        q: url.searchParams.get("q")?.slice(0, 100) ?? "",
        sort: s === "views" || s === "trending" ? s : "newest",
        page,
        hashtag: url.searchParams.get("hashtag")?.slice(0,120),
        duration: ["short","medium","long"].includes(url.searchParams.get("duration") || "") ? url.searchParams.get("duration") as "short"|"medium"|"long" : undefined,
        publishedDays: [30,90,365].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : undefined,
        contentType: url.searchParams.get("type")?.slice(0,40),
      }),
    );
  });
}
