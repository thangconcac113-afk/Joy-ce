import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { withUser } from "@/lib/api";
import { getDashboard, type RangeKey } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const ranges = new Set<RangeKey>(["24h", "7d", "30d", "90d"]);
const number = (value: number | null | undefined) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);

function rangeName(range: RangeKey) {
  return range === "24h" ? "the last 24 hours" : `the last ${range.slice(0, -1)} days`;
}

export async function POST(req: Request) {
  return withUser(async () => {
    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
    const range = ranges.has(body.range) ? (body.range as RangeKey) : "30d";
    if (!question) return NextResponse.json({ error: "Ask Radar AI a question first." }, { status: 400 });

    const data = await getDashboard(await getDb(), { range, platform: "all", accountId: null });
    const q = question.toLowerCase();
    const topVideo = data.topVideos[0];
    const topChannel = [...data.accounts].sort((a, b) => b.viewsGained - a.viewsGained)[0];
    const rising = data.kpis.viewsGainedPrev
      ? ((data.kpis.viewsGained - data.kpis.viewsGainedPrev) / data.kpis.viewsGainedPrev) * 100
      : null;
    let answer: string;

    if (/top|best|perform|video.*nhất|tốt nhất|cao nhất/.test(q) && topVideo) {
      answer = `The top-performing video in ${rangeName(range)} is “${topVideo.title}” from ${topVideo.accountTitle}. It gained ${number(topVideo.viewsGained)} views and has ${number(topVideo.views)} lifetime views.`;
    } else if (/channel|kênh/.test(q) && topChannel) {
      answer = `${topChannel.title} leads channel performance in ${rangeName(range)} with ${number(topChannel.viewsGained)} views gained, ${number(topChannel.engagementsGained)} engagements and ${number(topChannel.videosPublished)} published videos.`;
    } else if (/grow|growth|trend|develop|tăng|giảm|phát triển|xu hướng/.test(q)) {
      const direction = rising == null ? "does not have enough previous-period history for a reliable comparison" : rising >= 0 ? `is up ${Math.abs(rising).toFixed(1)}% versus the previous period` : `is down ${Math.abs(rising).toFixed(1)}% versus the previous period`;
      answer = `Channel reach ${direction}. The team gained ${number(data.kpis.viewsGained)} views, ${number(data.kpis.engagements)} engagements and ${number(data.kpis.followersGained)} followers in ${rangeName(range)}.`;
    } else if (/publish|upload|how many|bao nhiêu|đăng/.test(q)) {
      answer = `The team published ${number(data.kpis.videosPublished)} videos in ${rangeName(range)}. Those videos and the existing library gained ${number(data.kpis.viewsGained)} new views.`;
    } else {
      const leader = topVideo ? ` The current top video is “${topVideo.title}” with ${number(topVideo.viewsGained)} views gained.` : "";
      answer = `In ${rangeName(range)}, the team has ${number(data.kpis.followers)} total followers, gained ${number(data.kpis.viewsGained)} views and ${number(data.kpis.engagements)} engagements, and published ${number(data.kpis.videosPublished)} videos.${leader}`;
    }

    return NextResponse.json({
      answer,
      generatedAt: data.generatedAt,
      suggestions: ["What is our top video?", "Which channel performs best?", "Are our channels growing?"],
    });
  });
}
