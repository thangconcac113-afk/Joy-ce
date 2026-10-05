import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { withUser } from "@/lib/api";
import { getDashboard, type RangeKey } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const ranges = new Set<RangeKey>(["24h", "7d", "30d", "90d"]);
const number = (value: number | null | undefined) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);

type Lang = "en" | "vi";

function rangeName(range: RangeKey, vi: boolean) {
  if (vi) return range === "24h" ? "24 giờ qua" : `${range.slice(0, -1)} ngày qua`;
  return range === "24h" ? "the last 24 hours" : `the last ${range.slice(0, -1)} days`;
}

export async function POST(req: Request) {
  return withUser(async () => {
    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
    const vi = (body.lang as Lang) === "vi";
    const range = ranges.has(body.range) ? (body.range as RangeKey) : "30d";
    if (!question) return NextResponse.json({ error: vi ? "Hãy nhập câu hỏi trước." : "Ask TS Minion a question first." }, { status: 400 });

    const data = await getDashboard(await getDb(), { range, platform: "all", accountId: null });
    const q = question.toLowerCase();
    const topVideo = data.topVideos[0];
    const topChannel = [...data.accounts].sort((a, b) => b.viewsGained - a.viewsGained)[0];
    const rising = data.kpis.viewsGainedPrev
      ? ((data.kpis.viewsGained - data.kpis.viewsGainedPrev) / data.kpis.viewsGainedPrev) * 100
      : null;
    const rn = rangeName(range, vi);
    let answer: string;

    // Channel questions come first: "which channel performs best" would otherwise match the top-video rule.
    if (/channel|kênh/.test(q) && topChannel) {
      answer = vi
        ? `${topChannel.title} dẫn đầu trong ${rn} với ${number(topChannel.viewsGained)} lượt xem mới, ${number(topChannel.engagementsGained)} tương tác và ${number(topChannel.videosPublished)} video đã đăng.`
        : `${topChannel.title} leads channel performance in ${rn} with ${number(topChannel.viewsGained)} views gained, ${number(topChannel.engagementsGained)} engagements and ${number(topChannel.videosPublished)} published videos.`;
    } else if (/top|best|perform|video.*nhất|tốt nhất|cao nhất/.test(q) && topVideo) {
      answer = vi
        ? `Video chạy tốt nhất trong ${rn} là “${topVideo.title}” của ${topVideo.accountTitle}. Video này tăng ${number(topVideo.viewsGained)} lượt xem và có tổng ${number(topVideo.views)} lượt xem.`
        : `The top-performing video in ${rn} is “${topVideo.title}” from ${topVideo.accountTitle}. It gained ${number(topVideo.viewsGained)} views and has ${number(topVideo.views)} lifetime views.`;
    } else if (/grow|growth|trend|develop|tăng|giảm|phát triển|xu hướng/.test(q)) {
      const pct = rising == null ? null : Math.abs(rising).toFixed(1);
      const direction = vi
        ? rising == null ? "chưa đủ dữ liệu kỳ trước để so sánh" : rising >= 0 ? `tăng ${pct}% so với kỳ trước` : `giảm ${pct}% so với kỳ trước`
        : rising == null ? "does not have enough previous-period history for a reliable comparison" : rising >= 0 ? `is up ${pct}% versus the previous period` : `is down ${pct}% versus the previous period`;
      answer = vi
        ? `Lượt tiếp cận của các kênh ${direction}. Team có thêm ${number(data.kpis.viewsGained)} lượt xem, ${number(data.kpis.engagements)} tương tác và ${number(data.kpis.followersGained)} người theo dõi trong ${rn}.`
        : `Channel reach ${direction}. The team gained ${number(data.kpis.viewsGained)} views, ${number(data.kpis.engagements)} engagements and ${number(data.kpis.followersGained)} followers in ${rn}.`;
    } else if (/publish|upload|how many|bao nhiêu|đăng/.test(q)) {
      answer = vi
        ? `Team đã đăng ${number(data.kpis.videosPublished)} video trong ${rn}. Các video này cùng thư viện cũ có thêm ${number(data.kpis.viewsGained)} lượt xem.`
        : `The team published ${number(data.kpis.videosPublished)} videos in ${rn}. Those videos and the existing library gained ${number(data.kpis.viewsGained)} new views.`;
    } else {
      const leader = topVideo
        ? vi ? ` Video đang top: “${topVideo.title}” với ${number(topVideo.viewsGained)} lượt xem mới.` : ` The current top video is “${topVideo.title}” with ${number(topVideo.viewsGained)} views gained.`
        : "";
      answer = vi
        ? `Trong ${rn}, team có tổng ${number(data.kpis.followers)} người theo dõi, thêm ${number(data.kpis.viewsGained)} lượt xem và ${number(data.kpis.engagements)} tương tác, đăng ${number(data.kpis.videosPublished)} video.${leader}`
        : `In ${rn}, the team has ${number(data.kpis.followers)} total followers, gained ${number(data.kpis.viewsGained)} views and ${number(data.kpis.engagements)} engagements, and published ${number(data.kpis.videosPublished)} videos.${leader}`;
    }

    return NextResponse.json({
      answer,
      generatedAt: data.generatedAt,
      suggestions: vi ? ["Video nào đang top?", "Kênh nào chạy tốt nhất?", "Các kênh có đang tăng trưởng không?"] : ["What is our top video?", "Which channel performs best?", "Are our channels growing?"],
    });
  });
}
