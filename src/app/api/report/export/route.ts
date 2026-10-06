import { getDb } from "@/db/client";
import { jsonError, withUser } from "@/lib/api";
import { csvLine as line } from "@/lib/csv";
import { currentMonth, getMonthlyReport } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withUser(async () => {
    const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
    const r = await getMonthlyReport(await getDb(), month);
    if (!r) return jsonError("Month must look like 2026-10.", 400);
    const k = r.kpis;
    const out = [
      line(["Team Secret monthly report", r.month, r.complete ? "final" : "month in progress", `generated ${r.generatedAt}`]),
      "",
      line(["Metric", "This month", "Previous month"]),
      line(["Views gained", k.viewsGained, k.viewsGainedPrev]),
      line(["Engagements", k.engagements, k.engagementsPrev]),
      line(["Net new followers", k.followersGained, k.followersGainedPrev]),
      line(["Videos published", k.videosPublished, k.videosPublishedPrev]),
      line(["Total followers (now)", k.followers, ""]),
      line(["Avg view duration, last 30 days (sec)", r.avdSec === null ? "" : Math.round(r.avdSec), ""]),
      "",
      line(["Channel", "Platform", "Followers", "Followers gained", "Views gained", "Engagements", "Videos published", "Avg view duration (sec)"]),
      ...r.accounts.map((a) => line([a.title, a.platform, a.followers, a.followersGained, a.viewsGained, a.engagementsGained, a.videosPublished, a.avdSec === null ? "" : Math.round(a.avdSec)])),
      "",
      line(["Top videos", "Channel", "Published", "Views gained", "Total views", "URL"]),
      ...r.topVideos.map((v) => line([v.title, v.accountTitle, v.publishedAt, v.viewsGained, v.views, v.url])),
    ].join("\r\n");
    return new Response("﻿" + out, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="team-secret-report-${r.month}.csv"` },
    });
  });
}
