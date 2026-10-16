import {expect,it} from "vitest";
import {normalizeHashtag,extractHashtags} from "@/lib/hashtags";
import {openPglite} from "@/db/client";
import {accounts,videos,videoSnapshots} from "@/db/schema";
import {getLibrary} from "@/lib/metrics";
import {getInsights} from "@/lib/insights";
it("extracts and deduplicates campaign hashtags in titles and captions",()=>{
 expect(extractHashtags("Finals #EWC #TSW","Caption #tsw #VCT #Đội_Tuyển #ＥＷＣ")).toEqual(["ewc","tsw","vct","đội_tuyển"]);
 expect(normalizeHashtag(" #TSW ")).toBe("tsw");expect(normalizeHashtag("tsw%" )).toBe("");
});
it("filters exact hashtags across the library and content insights and searches captions",async()=>{
 const db=await openPglite("memory://");const [a]=await db.insert(accounts).values({platform:"tiktok",externalId:"tt-campaign",title:"Team Secret Whales"}).returning();
 const vs=await db.insert(videos).values([
 {accountId:a.id,platform:"tiktok",externalId:"a",title:"Finals",description:"EWC campaign #TSW",hashtags:["tsw","ewc"],publishedAt:new Date("2026-10-10")},
 {accountId:a.id,platform:"tiktok",externalId:"b",title:"Other",hashtags:["tsw2026"],publishedAt:new Date("2026-10-10")},
 ]).returning();await db.insert(videoSnapshots).values(vs.map(v=>({videoId:v.id,takenAt:new Date("2026-10-11"),views:100})));
 const now=new Date("2026-10-16");
 expect((await getLibrary(db,{platform:"all",hashtag:"#TSW",sort:"newest",page:1,now})).total).toBe(1);
 expect((await getLibrary(db,{platform:"all",q:"EWC campaign",sort:"newest",page:1,now})).items[0].title).toBe("Finals");
 const insight=await getInsights(db,{platform:"all",days:90,hours:24,hashtag:"#TSW"},now);
 expect(insight.items).toHaveLength(1);expect(insight.items[0].hashtags).toEqual(["tsw","ewc"]);
 expect((await getLibrary(db,{platform:"all",hashtag:"tsw%",sort:"newest",page:1,now})).total).toBe(0);
});
