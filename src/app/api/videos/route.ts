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
      }),
    );
  });
}
