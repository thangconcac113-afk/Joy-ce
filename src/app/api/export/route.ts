import { getDb } from "@/db/client";
import { parseFilters, withUser } from "@/lib/api";
import { csvLine as line } from "@/lib/csv";
import { getDashboard } from "@/lib/metrics";

export const dynamic = "force-dynamic";


export function GET(req: Request) {
  return withUser(async () => {
    const f = parseFilters(new URL(req.url));
    const d = await getDashboard(await getDb(), f);
    const out = [
      line([`TS Video Tracker report`, `range ${f.range}`, `platform ${f.platform}`, `generated ${d.generatedAt}`]),
      "",
      line(["Channel", "Platform", "Followers", "Followers gained", "Views gained", "Engagements gained", "Videos published"]),
      ...d.accounts.map((a) => line([a.title, a.platform, a.followers, a.followersGained, a.viewsGained, a.engagementsGained, a.videosPublished])),
      "",
      line(["Video", "Channel", "Platform", "Published", "Views", "Views gained", "Likes", "Comments", "Shares", "URL"]),
      ...d.topVideos.map((v) => line([v.title, v.accountTitle, v.platform, v.publishedAt, v.views, v.viewsGained, v.likes, v.comments, v.shares, v.url])),
    ].join("\r\n");
    return new Response("﻿" + out, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ts-video-tracker-${f.range}.csv"`,
      },
    });
  });
}
