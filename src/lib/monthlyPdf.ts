import pdfMake from "pdfmake/build/pdfmake";
import fonts from "pdfmake/build/vfs_fonts";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { MonthlyReport } from "./metrics";
import { dailyChartSvg } from "./monthlyGrowth";
import { loadPdfThumbnails } from "./pdfThumbnails";

pdfMake.addVirtualFileSystem(fonts);

// Team Secret brand: black, white, silver. Platform colours only as small accents.
const INK = "#0b0e14", PAPER = "#ffffff", SILVER = "#9aa3ad", MUTED = "#5c6672", RULE = "#e3e6ea", CARD = "#f4f5f7";
const PLATFORM = { youtube: { name: "YouTube", color: "#d7263d" }, tiktok: { name: "TikTok", color: "#111827" } } as const;

const number = (n: number | null) => n == null ? "Unavailable" : n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const compact = (n: number | null) => n == null ? "—" : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString("en-GB");
// Roboto supports Vietnamese text; omit decorative emoji rather than print missing-glyph boxes.
const text = (value: string) => value.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}️‍]/gu, "").replace(/[\u0000-\u001F]/g, " ");
const date = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" });
const dayOnly = (s: string) => new Date(s).toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "short", year: "numeric" });
const eyebrow = (value: string, color = SILVER): Content => ({ text: value.toUpperCase(), fontSize: 8, bold: true, color, characterSpacing: 1.5, margin: [0, 14, 0, 6] });
const noBorders = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };
const table = (headers: string[], rows: TableCell[][], widths: (number | "*")[], align: ("left" | "right")[] = []): Content => ({
  table: { headerRows: 1, widths, body: [
    headers.map((h, i) => ({ text: h.toUpperCase(), bold: true, fontSize: 7, color: MUTED, characterSpacing: .6, alignment: align[i] ?? "left", margin: [0, 0, 0, 2] })),
    ...rows.map(r => r.map((c, i) => typeof c === "object" && c && "alignment" in c ? c : typeof c === "string" || typeof c === "number" ? { text: c, alignment: align[i] ?? "left" } : c)),
  ] },
  layout: { hLineWidth: (i: number) => i <= 1 ? 1 : .5, hLineColor: (i: number) => i <= 1 ? INK : RULE, vLineWidth: () => 0, paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 0, paddingRight: () => 6 },
  margin: [0, 2, 0, 10], fontSize: 8.5,
});

export function monthlyPdfDefinition(r: MonthlyReport, images: Record<string, string> = {}): TDocumentDefinitions {
  const month = new Date(`${r.month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const comparisonLabel = r.complete ? "vs previous month" : "vs same days last month";
  const delta = (current: number | null, previous: number | null) => {
    if (!r.comparisonReady || current == null || previous == null || previous <= 0) return null;
    const pct = Math.round((current - previous) / previous * 1000) / 10;
    return { text: `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${Math.abs(pct).toFixed(1)}% ${comparisonLabel}  ·  prev ${number(previous)}`, color: pct > 0 ? "#1f7a4d" : pct < 0 ? "#b3261e" : MUTED };
  };
  const chart = (accountId?: number): Content[] => {
    const account = r.accounts.find(a => a.id === accountId);
    const svg = dailyChartSvg((r.dailyGrowth ?? []).filter(p => accountId == null || p.accountId === accountId), r.period.start, r.period.end, account ? PLATFORM[account.platform].color : "#334155");
    return [eyebrow("Daily measured views gained"), svg ? { svg, width: 515 } : { text: "No observed daily history in this period.", color: MUTED },
      { text: "Vietnam time. Grey days have no observations, not zero views. The latest day is partial.", fontSize: 7.5, color: SILVER, margin: [0, 2, 0, 6] }];
  };
  // KPI cards: the number is the hero, everything else whispers.
  const kpiCards = (items: { label: string; value: number | null; prev: number | null; dark?: boolean }[]): Content => ({
    columns: items.map(k => {
      const d = delta(k.value, k.prev);
      const fg = k.dark ? PAPER : INK;
      return { width: "*", table: { widths: ["*"], body: [[{
        fillColor: k.dark ? undefined : CARD, margin: [12, 10, 12, 12], stack: [
          { text: k.label.toUpperCase(), fontSize: 7.5, bold: true, color: k.dark ? SILVER : MUTED, characterSpacing: 1 },
          { text: compact(k.value), fontSize: k.dark ? 30 : 24, bold: true, color: fg, margin: [0, 6, 0, 2] },
          d ? { text: d.text, fontSize: 7.5, color: k.dark ? SILVER : d.color } : { text: k.value == null ? "Unavailable" : compact(k.value) === number(k.value) ? " " : number(k.value), fontSize: 7.5, color: k.dark ? SILVER : MUTED },
        ] }]] }, layout: noBorders };
    }), columnGap: 8, margin: [0, 4, 0, 12],
  });
  const platformChip = (p: "youtube" | "tiktok", dark = false) => ({ text: ` ${PLATFORM[p].name} `, fontSize: 7, bold: true, color: PAPER, background: dark && p === "tiktok" ? "#374151" : PLATFORM[p].color, characterSpacing: .5 });

  const content: Content[] = [
    // Cover (dark page, painted by `background`).
    { text: "TEAM SECRET", fontSize: 11, bold: true, color: PAPER, characterSpacing: 4, margin: [0, 150, 0, 0] },
    { text: "Video performance", fontSize: 36, bold: true, color: PAPER, margin: [0, 18, 0, 0] },
    { text: month, fontSize: 36, bold: true, color: SILVER, margin: [0, -4, 0, 10] },
    { text: r.complete ? "Completed month" : "Month to date, not a final month result", fontSize: 10, color: SILVER },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 60, y2: 0, lineWidth: 2, lineColor: PAPER }], margin: [0, 26, 0, 26] },
    kpiCards([
      { label: "Views gained", value: r.kpis.viewsGained, prev: r.kpis.viewsGainedPrev, dark: true },
      { label: "Engagements", value: r.kpis.engagements, prev: r.kpis.engagementsPrev, dark: true },
      { label: "Net followers", value: r.kpis.followersGained, prev: r.kpis.followersGainedPrev, dark: true },
      { label: "Videos published", value: r.kpis.videosPublished, prev: r.kpis.videosPublishedPrev, dark: true },
    ]),
    { text: `${number(r.kpis.followers)} total followers across ${r.accounts.length} channels`, fontSize: 10, color: PAPER, margin: [0, 4, 0, 0] },
    { text: [
      `Reporting ${dayOnly(r.period.start)} to ${dayOnly(new Date(new Date(r.period.end).getTime() - 1).toISOString())}, Vietnam time.\n`,
      r.comparisonReady ? `Compared with ${dayOnly(r.period.previousStart)} to ${dayOnly(new Date(new Date(r.period.previousEnd).getTime() - 1).toISOString())}.\n`
        : `Observed growth only. Tracking started ${r.trackingSince ? dayOnly(r.trackingSince) : "recently"}, so month-over-month comparisons are not shown yet.\n`,
      `Generated ${date(r.generatedAt)}.`,
    ], fontSize: 8.5, color: SILVER, lineHeight: 1.4, absolutePosition: { x: 48, y: 740 } },

    // Workspace overview.
    { text: "Workspace overview", fontSize: 22, bold: true, pageBreak: "before", margin: [0, 0, 0, 2] },
    { text: `All ${r.accounts.length} tracked channels, ${month}`, color: MUTED, margin: [0, 0, 0, 10] },
    kpiCards([
      { label: "Views gained", value: r.kpis.viewsGained, prev: r.kpis.viewsGainedPrev },
      { label: "Engagements", value: r.kpis.engagements, prev: r.kpis.engagementsPrev },
      { label: "Net followers", value: r.kpis.followersGained, prev: r.kpis.followersGainedPrev },
      { label: "Videos published", value: r.kpis.videosPublished, prev: r.kpis.videosPublishedPrev },
    ]),
    ...chart(),
    eyebrow("Channel contribution"),
    table(["Channel", "Share", "Views gained", "Engagements", "Net followers", "Videos"], [...r.accounts].sort((a, b) => b.viewsGained - a.viewsGained).map(a => [
      { stack: [{ text: text(a.title), bold: true }, { columns: [{ width: "auto", ...platformChip(a.platform) }, { text: a.handle ? ` ${text(a.handle)}` : "", color: MUTED, fontSize: 7.5 }], margin: [0, 2, 0, 0] }] },
      { text: r.kpis.viewsGained > 0 ? `${(a.viewsGained / r.kpis.viewsGained * 100).toFixed(1)}%` : "—", alignment: "right", color: MUTED },
      { text: number(a.viewsGained), alignment: "right", bold: true },
      { text: number(a.engagementsGained), alignment: "right" },
      { text: number(a.followersGained), alignment: "right" },
      { text: number(a.videosPublished), alignment: "right" },
    ]), ["*", 44, 74, 72, 72, 44], ["left", "right", "right", "right", "right", "right"]),
  ];

  for (const a of r.accounts) {
    const share = r.kpis.viewsGained > 0 ? `${(a.viewsGained / r.kpis.viewsGained * 100).toFixed(1)}% of workspace views gained` : "No workspace views measured";
    const avatar = images[`avatar${a.id}`];
    content.push(
      // Channel header band: avatar, title, platform chip on ink.
      { table: { widths: ["*"], body: [[{ fillColor: INK, margin: [16, 14, 16, 14], columns: [
        avatar ? { image: `avatar${a.id}`, width: 44, height: 44 } : { width: 44, canvas: [{ type: "ellipse", x: 22, y: 22, r1: 22, r2: 22, color: "#374151" }] },
        { width: "*", margin: [12, 1, 0, 0], stack: [
          { text: text(a.title), fontSize: text(a.title).length > 24 ? 16 : 20, bold: true, color: PAPER },
          { columns: [{ width: "auto", ...platformChip(a.platform, true) }, { text: `${a.handle ? `  ${text(a.handle)}  ·` : " "}  ${month}`, color: SILVER, fontSize: 8.5 }], margin: [0, 4, 0, 0] },
        ] },
        { width: 150, text: share, alignment: "right", color: SILVER, fontSize: 8.5, margin: [0, 6, 0, 0] },
      ] }]] }, layout: noBorders, pageBreak: "before", margin: [0, 0, 0, 12] },
      kpiCards([
        { label: "Views gained", value: a.viewsGained, prev: a.viewsGainedPrev },
        { label: "Engagements", value: a.engagementsGained, prev: a.engagementsGainedPrev },
        { label: "Net followers", value: a.followersGained, prev: a.followersGainedPrev },
        { label: "Videos published", value: a.videosPublished, prev: a.videosPublishedPrev },
      ]),
      { columns: [
        { text: [{ text: "Followers at period end  ", color: MUTED }, { text: number(a.followers), bold: true }] },
        ...(a.platform === "youtube" ? [{ text: [{ text: "Average view duration  ", color: MUTED }, { text: a.avdSec == null ? "Unavailable" : `${number(a.avdSec)} s`, bold: true }] }] : []),
        { text: !a.lastPolledAt ? "Never synced" : a.lastError ? "Sync error, see Channels" : `Last sync ${date(a.lastPolledAt)}`, alignment: "right", color: a.lastError ? "#b3261e" : MUTED },
      ], fontSize: 8.5, margin: [0, 0, 0, 4] },
      ...chart(a.id),
      eyebrow("Top videos by views gained"),
    );
    if (a.topVideos.length) {
      content.push(table(["#", "", "Video", "Views gained", "Total", "Eng."], a.topVideos.map((v, i) => [
        { text: String(i + 1), bold: true, color: SILVER, fontSize: 11 },
        images[`video${v.id}`] ? { image: `video${v.id}`, width: 88, height: 50 } : { canvas: [{ type: "rect", x: 0, y: 0, w: 88, h: 50, color: CARD }] },
        { stack: [
          { text: text(v.title).length > 110 ? `${text(v.title).slice(0, 107)}...` : text(v.title), bold: true, ...(v.url?.startsWith("https://") ? { link: v.url } : {}) },
          { text: v.publishedAt ? `Published ${dayOnly(v.publishedAt)}` : "Publication date unavailable", color: MUTED, fontSize: 7.5, margin: [0, 2, 0, 0] },
        ], margin: [0, 4, 0, 0] },
        { text: `+${number(v.viewsGained)}`, alignment: "right", bold: true, margin: [0, 4, 0, 0] },
        { text: number(v.views), alignment: "right", color: MUTED, margin: [0, 4, 0, 0] },
        { text: number(v.engagementsGained), alignment: "right", color: MUTED, margin: [0, 4, 0, 0] },
      ]), [14, 88, "*", 64, 58, 40], ["left", "left", "left", "right", "right", "right"]));
    } else content.push({ text: "No positive video growth was observed during this period.", color: MUTED });
  }

  content.push(
    { text: "How to read this report", fontSize: 22, bold: true, pageBreak: "before", margin: [0, 0, 0, 12] },
    { ul: [
      "Sources: YouTube Data API, connected YouTube Analytics and TikTok Display API. No invented or demo metrics are inserted into this report.",
      "Views and engagement gained are observed differences on tracked videos. Imported lifetime totals are excluded from new growth, and 0-view readings for videos older than a day are treated as provider glitches. Missing history means measured results can understate the full month's actual performance.",
      "Follower totals use the latest available observation at/before period end. Net follower change may be negative. YouTube subscriber numbers are rounded upstream.",
      "Publication counts cover videos published in the reporting window. All reporting boundaries follow Vietnam time (UTC+7). A running month compares the same elapsed time in the previous month. Comparisons appear only once a full previous month of tracking exists.",
      "Engagements = likes + comments + available shares. YouTube shares are unavailable here. Cross-platform engagement totals therefore have different coverage.",
      "Average view duration uses the selected month's owner-only YouTube Analytics cache. TikTok watch duration and YouTube impression CTR are unavailable in this integration. Unavailable is not zero.",
      "Last sync reflects current connection health, not historical month-end health. Synchronization is periodic and source APIs may report with delay.",
      "Decorative emoji may be omitted from PDF titles for font compatibility. Original video links preserve access to full source content.",
      "Charts show observed positive counter increments grouped by Vietnam calendar day. Grey days have no usable observations. Sync gaps attribute changes to the day observed; source corrections can make daily positive increments differ from monthly net growth.",
      "Video thumbnails and channel avatars are embedded from trusted source CDNs for offline viewing. Expired or unavailable previews do not prevent report export.",
      "Top videos may predate the month. Totals are lifetime counters. Long captions are shortened; click a title for the original. No first-week history is inferred.",
    ], lineHeight: 1.4, fontSize: 8.5, color: MUTED },
  );

  return {
    pageSize: "A4", pageMargins: [48, 48, 48, 52],
    info: { title: `Team Secret video performance, ${month}`, author: "Team Secret", subject: "Monthly channel performance" },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.1 },
    background: (page, size) => page === 1 ? { canvas: [{ type: "rect", x: 0, y: 0, w: size.width, h: size.height, color: INK }] } : null,
    footer: (page, pages) => page === 1 ? null : { columns: [
      { text: "TEAM SECRET  ·  VIDEO PERFORMANCE", fontSize: 7, bold: true, color: SILVER, characterSpacing: 1 },
      { text: `${month}   ${page} / ${pages}`, alignment: "right", fontSize: 7, color: SILVER },
    ], margin: [48, 18, 48, 0] },
    content, images,
  };
}

export async function createMonthlyPdf(report: MonthlyReport): Promise<Buffer> {
  const images = await loadPdfThumbnails(report);
  return pdfMake.createPdf(monthlyPdfDefinition(report, images)).getBuffer();
}
