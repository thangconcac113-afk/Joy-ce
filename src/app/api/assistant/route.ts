import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { withUser, parseFilters } from "@/lib/api";
import { getInsights, groupInsights, CONTENT_TYPES } from "@/lib/insights";
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

    const filterUrl = new URL("https://local/");
    filterUrl.searchParams.set("range", range);
    if (typeof body.platform === "string") filterUrl.searchParams.set("platform", body.platform);
    if (Number.isSafeInteger(body.account) && body.account > 0) filterUrl.searchParams.set("account", String(body.account));
    const filters = parseFilters(filterUrl);
    const db = await getDb();
    const data = await getDashboard(db, filters);
    const q = question.toLowerCase();
    const topVideo = data.topVideos[0];
    const topChannel = [...data.accounts].sort((a, b) => b.viewsGained - a.viewsGained)[0];
    const rising = data.comparisonReady && data.kpis.viewsGainedPrev
      ? ((data.kpis.viewsGained - data.kpis.viewsGainedPrev) / data.kpis.viewsGainedPrev) * 100
      : null;
    const rn = rangeName(range, vi);
    let answer: string;

    // Channel questions come first: "which channel performs best" would otherwise match the top-video rule.
    if (/channel|kênh/.test(q) && !/grow|growth|tăng|giảm|phát triển/.test(q) && topChannel) {
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
        ? `Lượt xem đo được của các kênh ${direction}. Team có thêm ${number(data.kpis.viewsGained)} lượt xem, ${number(data.kpis.engagements)} tương tác và ${number(data.kpis.followersGained)} người theo dõi trong ${rn}.`
        : `Measured views ${direction}. The team gained ${number(data.kpis.viewsGained)} views, ${number(data.kpis.engagements)} engagements and ${number(data.kpis.followersGained)} followers in ${rn}.`;
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

    const sources: {title: string; href: string}[] = topVideo ? [{title: topVideo.title, href: `/library/${topVideo.id}`}] : [];
    if (body.hashtag || /content|format|meme|mic check|highlight|bts|campaign|editor|nội dung|loại|why|tại sao|so sánh|compare/.test(q)) {
      const hours = /24/.test(q) ? 24 : /72/.test(q) ? 72 : 168;
      const days = range === "90d" ? 90 : range === "7d" ? 7 : range === "24h" ? 1 : 30;
      const insights = await getInsights(db, { platform: filters.platform, accountId: filters.accountId, hours, days, hashtag: typeof body.hashtag === "string" ? body.hashtag.slice(0,120) : undefined });
      const mentioned = CONTENT_TYPES.filter((type) => q.includes(type.toLowerCase()));
      const groups = groupInsights(insights.items).filter((g) => g.samples >= 5 && g.label !== "Untagged" && (!mentioned.length || mentioned.includes(g.label as typeof CONTENT_TYPES[number])));
      const leader = groups[0];
      if (leader) {
        const peers = groups.filter((g) => g.accountTitle === leader.accountTitle && g.platform === leader.platform && g.length === leader.length).slice(0,3);
        const evidence = peers.map((g) => `${g.label}: ${number(g.medianViews)} median views (${g.samples} videos)`).join("; ");
        answer = vi ? `Trong phạm vi đang chọn, tại mốc ${hours} giờ sau đăng: ${evidence}. So sánh trong cùng kênh ${leader.accountTitle}, cùng nhóm độ dài ${leader.length}. Đây là mối liên hệ từ kết quả thực tế, chưa chứng minh nguyên nhân tăng giảm.` : `Within the selected scope, at ${hours} hours after publication: ${evidence}. These groups share channel ${leader.accountTitle} and duration band ${leader.length}. This is an observed association, not proof of what caused performance.`;
      } else {
        answer = vi ? `Chưa đủ dữ liệu để kết luận loại nội dung nào hiệu quả hơn. Cần gắn tag và ít nhất 5 video có dữ liệu tại mốc ${hours} giờ trong cùng nhóm kênh và độ dài. Hiện có ${insights.eligible}/${insights.items.length} video đo được mốc này trong phạm vi đang chọn. Không thể khôi phục mốc cũ từ lượt xem hiện tại.` : `There is not enough evidence to rank content types reliably. Tag videos and collect at least 5 measured videos at the ${hours}-hour milestone per channel and duration group. Currently ${insights.eligible} of ${insights.items.length} videos in the selected scope have that milestone. Past milestones cannot be reconstructed from today's counters.`;
      }
      sources.splice(0, sources.length, { title: "Content insights and sample sizes", href: `/insights?platform=${filters.platform}&range=${range}${filters.accountId ? `&account=${filters.accountId}` : ""}` });
    }
    const scopeName = (filters.accountId ? data.accounts[0]?.title ?? "Selected channel" : filters.platform === "all" ? "All channels" : filters.platform) + (typeof body.hashtag === "string" ? ` (${body.hashtag.slice(0,100)})` : "");
    if (!data.comparisonReady) answer += vi ? " Lịch sử theo dõi chưa đủ cho cả hai kỳ, nên chưa thể kết luận tăng giảm theo phần trăm." : " Tracking history does not yet cover both periods, so percentage growth comparisons are unavailable.";
    answer += vi ? ` Phạm vi: ${scopeName}, ${rn}.` : ` Scope: ${scopeName}, ${rn}.`;
    return NextResponse.json({
      answer,
      sources,
      generatedAt: data.generatedAt,
      suggestions: vi ? ["Video nào đang top?", "Kênh nào chạy tốt nhất?", "Các kênh có đang tăng trưởng không?"] : ["What is our top video?", "Which channel performs best?", "Are our channels growing?"],
    });
  });
}
