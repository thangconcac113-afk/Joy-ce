import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { openPglite } from "@/db/client";
import { accounts, accountSnapshots, videos, videoSnapshots } from "@/db/schema";
import { getMonthlyGrowth, dailyChartSvg } from "@/lib/monthlyGrowth";
import { allowedThumbnailUrl, loadPdfThumbnails } from "@/lib/pdfThumbnails";

describe("PDF visual data", () => {
  it("excludes import spikes, keeps same-day gains and respects Vietnam day boundaries", async () => {
    const db = await openPglite("memory://");
    const [a] = await db.insert(accounts).values({platform:"tiktok",externalId:"visual",title:"Visual"}).returning();
    await db.insert(accountSnapshots).values({accountId:a.id,takenAt:new Date("2026-10-15T10:00:00Z"),followers:10});
    const [v] = await db.insert(videos).values({accountId:a.id,platform:"tiktok",externalId:"old",title:"Imported",publishedAt:new Date("2026-09-01")}).returning();
    await db.insert(videoSnapshots).values([
      {videoId:v.id,takenAt:new Date("2026-10-15T10:00:00Z"),views:100000},
      {videoId:v.id,takenAt:new Date("2026-10-15T16:59:00Z"),views:100200},
      {videoId:v.id,takenAt:new Date("2026-10-15T17:01:00Z"),views:100300},
    ]);
    const points = await getMonthlyGrowth(db,new Date("2026-09-30T17:00:00Z"),new Date("2026-10-16T10:00:00Z"));
    expect(points.map(p=>[p.day,p.views])).toEqual([["2026-10-15",200],["2026-10-16",100]]);
    expect(dailyChartSvg([],"2026-10-01","2026-10-31")).toBeNull();
    const svg = dailyChartSvg(points,"2026-09-30T17:00:00Z","2026-10-16T10:00:00Z")!;
    expect(svg).toContain("#f0f3f6");
    expect(svg).toContain("16/10");
  });
  it("embeds a valid preview once and refuses redirects, untrusted hosts and oversized responses", async () => {
    expect(allowedThumbnailUrl("https://127.0.0.1/image.jpg")).toBe(false);
    expect(allowedThumbnailUrl("https://i.ytimg.com.evil.test/x")).toBe(false);
    expect(allowedThumbnailUrl("http://i.ytimg.com/x")).toBe(false);
    const image=await sharp({create:{width:16,height:9,channels:3,background:"blue"}}).png().toBuffer();
    const fetchFn=vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(image),{headers:{"content-type":"image/png"}}));
    const video={id:1,thumbnailUrl:"https://i.ytimg.com/vi/valid/default.jpg"};
    const result=await loadPdfThumbnails({accounts:[{topVideos:[video,video,{id:2,thumbnailUrl:"https://localhost/x"}]}]},fetchFn);
    expect(Object.keys(result)).toEqual(["video1"]);
    expect(result.video1).toMatch(/^data:image\/jpeg;base64,/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1]?.redirect).toBe("error");
    fetchFn.mockResolvedValue(new Response("too big",{headers:{"content-type":"image/jpeg","content-length":"2000000"}}));
    expect(await loadPdfThumbnails({accounts:[{topVideos:[video]}]},fetchFn)).toEqual({});
    fetchFn.mockRejectedValue(new Error("CDN unavailable"));
    expect(await loadPdfThumbnails({accounts:[{topVideos:[video]}]},fetchFn)).toEqual({});
  });
});
