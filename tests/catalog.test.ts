import { expect, it } from "vitest";
import { fetchRecentVideos } from "@/lib/youtube";
import { fetchVideos, queryVideos } from "@/lib/tiktok";
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
it("discovers YouTube pages until the 2026 cutoff and batches video lookups", async () => {
  let pages = 0; let lookups = 0;
  const fake = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith("playlistItems")) {
      pages++;
      return json(pages === 1 ? { nextPageToken: "p2", items: Array.from({length:50}, (_, i) => ({ contentDetails: {videoId: String(i), videoPublishedAt:"2026-10-01T00:00:00Z"} })) } : { nextPageToken:"p3", items:[{contentDetails:{videoId:"old",videoPublishedAt:"2025-12-01T00:00:00Z"}}, {contentDetails:{videoId:"50",videoPublishedAt:"2026-01-02T00:00:00Z"}}] });
    }
    lookups++;
    return json({items:u.searchParams.get("id")!.split(",").map((id) => ({id,snippet:{publishedAt:"2026-01-02T00:00:00Z"}}))});
  }) as typeof fetch;
  const videos = await fetchRecentVideos("uploads", "key", 5000, fake, "2026-01-01T00:00:00.000Z");
  expect(pages).toBe(2); expect(lookups).toBe(2); expect(videos).toHaveLength(51);
});
it("stops TikTok discovery at cutoff and refreshes stored videos in batches of 20", async () => {
  let calls = 0;
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    calls++;
    if (String(input).includes("/list/")) return json({data:{videos:[{id:"new",create_time:1780000000},{id:"old",create_time:1700000000}],has_more:true,cursor:1},error:{code:"ok"}});
    const ids = JSON.parse(String(init?.body)).filters.video_ids;
    expect(ids.length).toBeLessThanOrEqual(20);
    return json({data:{videos:ids.map((id:string)=>({id}))},error:{code:"ok"}});
  }) as typeof fetch;
  expect(await fetchVideos("token",5000,fake,"2026-01-01T00:00:00.000Z")).toHaveLength(1);
  expect(calls).toBe(1);
  expect(await queryVideos("token",Array.from({length:41},(_,i)=>String(i)),fake)).toHaveLength(41);
  expect(calls).toBe(4);
});
