import pdfMake from "pdfmake/build/pdfmake";
import fonts from "pdfmake/build/vfs_fonts";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { MonthlyReport } from "./metrics";
import { dailyChartSvg } from "./monthlyGrowth";
import { loadPdfThumbnails } from "./pdfThumbnails";

pdfMake.addVirtualFileSystem(fonts);
const number = (n: number | null) => n == null ? "Unavailable" : n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
// Roboto supports Vietnamese text; omit decorative emoji rather than print missing-glyph boxes.
const text = (value: string) => value.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, "").replace(/[\u0000-\u001F]/g, " ");
const date = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" });
const table = (headers: string[], rows: TableCell[][], widths: (number | "*")[]): Content => ({
  table: { headerRows: 1, widths, body: [headers.map(h => ({ text: h, bold: true, color: "#ffffff", fillColor: "#182d41" })), ...rows] },
  layout: "lightHorizontalLines", margin: [0, 6, 0, 9], fontSize: 8.5,
});
const h2 = (value: string): Content => ({ text: value, fontSize: 13, bold: true, margin: [0, 10, 0, 5] });

export function monthlyPdfDefinition(r: MonthlyReport, images: Record<string, string> = {}): TDocumentDefinitions {
  const month = new Date(`${r.month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const comparison = r.complete ? "Previous calendar month" : "Same elapsed time last month";
  const chart = (accountId?: number): Content[] => {
    const svg = dailyChartSvg((r.dailyGrowth ?? []).filter(p => accountId == null || p.accountId === accountId), r.period.start, r.period.end,
      r.accounts.find(a => a.id === accountId)?.platform === "tiktok" ? "#e77135" : "#2671b8");
    return [h2("Daily measured views gained"), svg ? { svg, width: 515 } : { text: "No observed daily history in this period.", color: "#536273" },
      { text: "Vietnam time. Grey days have no observations, not zero views. Latest day is partial. Counter corrections and sync gaps can differ from monthly net growth.", fontSize: 8, color: "#536273", margin: [0, 0, 0, 8] }];
  };
  const change = (current: number | null, previous: number | null) => {
    if (!r.comparisonReady || current == null || previous == null) return "Insufficient history";
    if (previous <= 0) return "No positive baseline";
    const pct = (current - previous) / previous * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };
  const metricTable = (rows: [string, number | null, number | null][]) => table(
    ["Metric", "Selected period", "Previous period", "Change"],
    rows.map(([name, current, prev]) => [name, number(current), r.comparisonReady ? number(prev) : "Insufficient history", change(current, prev)]),
    ["*", 94, 94, 92],
  );
  const content: Content[] = [
    { text: "TS VIDEO TRACKER", fontSize: 11, bold: true, color: "#2671b8", characterSpacing: 2 },
    { text: "Monthly performance report", fontSize: 27, bold: true, margin: [0, 12, 0, 6] },
    { text: month, fontSize: 20, color: "#2671b8" },
    { text: `${r.complete ? "Completed month" : "Month to date, not a final month result"} | Vietnam time (UTC+7)`, margin: [0, 8, 0, 12] },
    { text: `Reporting: ${date(r.period.start)} to ${date(r.period.end)} (end exclusive).\nComparison: ${date(r.period.previousStart)} to ${date(r.period.previousEnd)}.\nGenerated: ${date(r.generatedAt)}.`, color: "#536273", fontSize: 9 },
    { text: r.comparisonReady ? `Comparison coverage available. ${comparison}.` : `PARTIAL TRACKING HISTORY: observed growth only. Historical growth before connection cannot be reconstructed. Comparisons are withheld.${r.trackingSince ? ` Full channel coverage started ${date(r.trackingSince)}.` : " No complete tracking baseline yet."}`, color: r.comparisonReady ? "#25704f" : "#845a0b", margin: [0, 14, 0, 12] },
    h2("Workspace performance"),
    metricTable([
      ["Views gained", r.kpis.viewsGained, r.kpis.viewsGainedPrev],
      ["Engagements gained", r.kpis.engagements, r.kpis.engagementsPrev],
      ["Net followers", r.kpis.followersGained, r.kpis.followersGainedPrev],
      ["Videos published", r.kpis.videosPublished, r.kpis.videosPublishedPrev],
    ]),
    { text: `Total followers at period end: ${number(r.kpis.followers)}. ${r.accounts.length} tracked channels.`, bold: true },
    ...chart(),
    h2("Channel contribution"),
    table(["Channel / platform", "Views gained", "Engagements", "Net followers", "Videos"], r.accounts.map(a => [text(`${a.title}\n${a.platform === "youtube" ? "YouTube" : "TikTok"}`), number(a.viewsGained), number(a.engagementsGained), number(a.followersGained), number(a.videosPublished)]), ["*", 75, 75, 72, 42]),
  ];
  for (const a of r.accounts) {
    const share = r.kpis.viewsGained > 0 ? `${(a.viewsGained / r.kpis.viewsGained * 100).toFixed(1)}% of workspace measured views` : "No workspace views measured";
    content.push(
      { text: text(a.title), fontSize: 23, bold: true, pageBreak: "before", margin: [0, 8, 0, 8] },
      { text: `${a.platform === "youtube" ? "YouTube" : "TikTok"}${a.handle ? ` | ${text(a.handle)}` : ""} | ${month}`, color: "#2671b8", margin: [0, 0, 0, 12] },
      { text: share, bold: true },
      h2("Key metrics"),
      metricTable([
        ["Views gained", a.viewsGained, a.viewsGainedPrev],
        ["Engagements gained", a.engagementsGained, a.engagementsGainedPrev],
        ["Net followers", a.followersGained, a.followersGainedPrev],
        ["Videos published", a.videosPublished, a.videosPublishedPrev],
      ]),
      table(["Additional metric", "Value"], [
        ["Followers at period end", number(a.followers)],
        ["Average view duration, selected calendar month", a.platform === "youtube" ? (a.avdSec == null ? "Unavailable" : `${number(a.avdSec)} seconds`) : "YouTube only"],
      ], ["*", 200]),
      { text: !a.lastPolledAt ? "Current sync health: never synced." : a.lastError ? "Current sync health: a sync error needs attention. See Channels." : `Last successful sync: ${date(a.lastPolledAt)}.`, fontSize: 9, color: "#536273" },
      ...chart(a.id),
      h2("Top videos by measured views gained"),
    );
    if (a.topVideos.length) {
      content.push(table(["Preview", "Video / published", "Views gained", "Period-end total", "Eng. gained"], a.topVideos.map(v => [
        images[`video${v.id}`] ? { image: `video${v.id}`, width: 66, height: 37 } : { text: "Preview unavailable", fontSize: 8, color: "#536273" },
        { text: `${text(v.title).length > 130 ? `${text(v.title).slice(0,127)}...` : text(v.title)}\n${v.publishedAt ? date(v.publishedAt) : "Publication date unavailable"}`, ...(v.url?.startsWith("https://") ? { link: v.url } : {}) },
        number(v.viewsGained), number(v.views), number(v.engagementsGained),
      ]), [66, "*", 61, 65, 53]));
    } else content.push({ text: "No positive video growth was observed during this period.", color: "#536273" });
    content.push({ text: "Top videos may predate this month. Period-end totals are lifetime counters. Long captions are shortened; click the title for the original. No first-week history is inferred.", fontSize: 8, color: "#536273", margin: [0, 6, 0, 0] });
  }
  content.push(
    { text: "Sources and measurement notes", fontSize: 23, bold: true, pageBreak: "before", margin: [0, 8, 0, 14] },
    { ul: [
      "Sources: YouTube Data API, connected YouTube Analytics and TikTok Display API. No invented or demo metrics are inserted into this report.",
      "Views and engagement gained are observed differences on tracked videos. Imported lifetime totals are excluded from new growth. Missing history means measured results can understate the full month's actual performance.",
      "Follower totals use the latest available observation at/before period end. Net follower change may be negative. YouTube subscriber numbers are rounded upstream.",
      "Publication counts cover videos published in the reporting window. All reporting boundaries follow Vietnam time (UTC+7). A running month compares the same elapsed time in the previous month.",
      "Engagements = likes + comments + available shares. YouTube shares are unavailable here. Cross-platform engagement totals therefore have different coverage.",
      "Average view duration uses the selected month's owner-only YouTube Analytics cache. TikTok watch duration and YouTube impression CTR are unavailable in this integration. Unavailable is not zero.",
      "Last sync reflects current connection health, not historical month-end health. Synchronization is periodic and source APIs may report with delay.",
      "Decorative emoji may be omitted from PDF titles for font compatibility. Original video links preserve access to full source content.",
      "Charts show observed positive counter increments grouped by Vietnam calendar day. Grey days have no usable observations. Sync gaps attribute changes to the day observed; source corrections can make daily positive increments differ from monthly net growth.",
      "Video thumbnails are embedded from trusted source CDNs for offline viewing. Expired or unavailable previews do not prevent report export.",
    ], lineHeight: 1.4 },
  );
  return {
    pageSize: "A4", pageMargins: [38, 38, 38, 38],
    info: { title: `TS Video Tracker - ${month}`, author: "Team Secret", subject: "Monthly channel performance" },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: "#182d41", lineHeight: 1.1 },
    footer: (page, pages) => ({ text: `TS Video Tracker | ${r.month} | ${page} / ${pages}`, alignment: "center", fontSize: 8, color: "#536273", margin: [0, 18, 0, 0] }),
    content, images,
  };
}

export async function createMonthlyPdf(report: MonthlyReport): Promise<Buffer> {
  const images = await loadPdfThumbnails(report);
  return pdfMake.createPdf(monthlyPdfDefinition(report, images)).getBuffer();
}
