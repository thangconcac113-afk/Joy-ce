import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseFilters, withUser } from "@/lib/api";
import { getInsights, groupInsights } from "@/lib/insights";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return withUser(async () => {
    const url = new URL(req.url); const f = parseFilters(url);
    const h = Number(url.searchParams.get("hours")); const d = Number(url.searchParams.get("days"));
    const result = await getInsights(await getDb(), { platform: f.platform, accountId: f.accountId, hours: [24,72,168].includes(h) ? h : 168, days: [30,90,365].includes(d) ? d : 90, contentType: url.searchParams.get("type")?.slice(0,40), game: url.searchParams.get("game")?.slice(0,80), campaign: url.searchParams.get("campaign")?.slice(0,80) });
    const dimension = url.searchParams.get("group");
    return NextResponse.json({ ...result, groups: groupInsights(result.items, dimension === "game" || dimension === "campaign" || dimension === "editor" ? dimension : "contentType") });
  });
}
