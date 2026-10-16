import { expect, it } from "vitest";
import { openPglite } from "@/db/client";
import { accounts, accountSnapshots, videos, videoSnapshots } from "@/db/schema";
import { getInsights, groupInsights } from "@/lib/insights";
it("compares measured views at the same age and excludes late imports and young videos", async () => {
  const db = await openPglite("memory://");
  const [a] = await db.insert(accounts).values({platform:"youtube",externalId:"yt",title:"Main"}).returning();
  await db.insert(accountSnapshots).values({accountId:a.id,takenAt:new Date("2026-10-01"),followers:100});
  const rows = await db.insert(videos).values([
    {accountId:a.id,platform:"youtube",externalId:"v1",title:"Meme 1",contentType:"Meme",publishedAt:new Date("2026-10-10"),durationSec:30},
    {accountId:a.id,platform:"youtube",externalId:"v2",title:"Meme 2",contentType:"Meme",publishedAt:new Date("2026-10-11"),durationSec:30},
    {accountId:a.id,platform:"youtube",externalId:"v3",title:"Imported",contentType:"Meme",publishedAt:new Date("2026-09-10"),durationSec:30},
  ]).returning();
  await db.insert(videoSnapshots).values([
    {videoId:rows[0].id,takenAt:new Date("2026-10-10T23:50:00Z"),views:1000,likes:50},
    {videoId:rows[1].id,takenAt:new Date("2026-10-11T23:50:00Z"),views:3000,likes:150},
    {videoId:rows[2].id,takenAt:new Date("2026-10-12"),views:100000},
  ]);
  const d = await getInsights(db,{platform:"all",days:90,hours:24},new Date("2026-10-13"));
  expect(d.items).toHaveLength(3); expect(d.eligible).toBe(2);
  expect(d.groups[0]).toMatchObject({samples:2,medianViews:2000,medianEngagementRate:5});
  expect(groupInsights(d.items,"campaign")[0].label).toBe("Untagged");
  const young = await getInsights(db,{platform:"all",days:90,hours:168},new Date("2026-10-13"));
  expect(young.eligible).toBe(0); expect(young.groups[0].medianViews).toBeNull();
});
