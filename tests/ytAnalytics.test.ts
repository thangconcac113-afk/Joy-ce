import { describe, expect, it } from "vitest";
import { fetchChannelStats, fetchVideoStats } from "@/lib/ytAnalytics";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("youtube analytics", () => {
  it("reads AVD and CTR for a channel", async () => {
    const fetchFn = (async (url: string) =>
      String(url).includes("videoThumbnailImpressions")
        ? json({ columnHeaders: [{ name: "videoThumbnailImpressions" }, { name: "videoThumbnailImpressionsClickRate" }], rows: [[1000, 5.2]] })
        : json({ columnHeaders: [{ name: "views" }, { name: "averageViewDuration" }, { name: "averageViewPercentage" }], rows: [[900, 83, 41.5]] })) as unknown as typeof fetch;
    expect(await fetchChannelStats("tok", "UC1", 28, new Date("2026-10-05"), fetchFn)).toEqual({ views: 900, avdSec: 83, avgViewPct: 41.5, impressions: 1000, ctr: 5.2 });
  });

  it("keeps AVD when YouTube refuses the impressions metrics", async () => {
    const fetchFn = (async (url: string) =>
      String(url).includes("videoThumbnailImpressions")
        ? json({ error: { message: "nope" } }, 400)
        : json({ columnHeaders: [{ name: "video" }, { name: "views" }, { name: "averageViewDuration" }, { name: "averageViewPercentage" }], rows: [["abc", 10, 30, 50]] })) as unknown as typeof fetch;
    const m = await fetchVideoStats("tok", "UC1", 28, new Date("2026-10-05"), fetchFn);
    expect(m.get("abc")).toEqual({ views: 10, avdSec: 30, avgViewPct: 50, impressions: null, ctr: null });
  });
});
