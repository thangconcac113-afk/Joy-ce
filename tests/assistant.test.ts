import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({dashboard:vi.fn(),insights:vi.fn()}));
vi.mock("@/lib/api",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/api")>(),withUser:(fn:()=>Promise<Response>)=>fn()}));
vi.mock("@/auth",()=>({currentUser:async()=>({email:"test@example.test"})}));
vi.mock("@/db/client",()=>({getDb:async()=>({})}));
vi.mock("@/lib/metrics",()=>({RANGES:{"24h":1,"7d":7,"30d":30,"90d":90},getDashboard:mocks.dashboard}));
vi.mock("@/lib/insights",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/insights")>(),getInsights:mocks.insights}));
import { POST } from "@/app/api/assistant/route";
beforeEach(()=>{
 mocks.dashboard.mockReset();mocks.insights.mockReset();
 mocks.dashboard.mockResolvedValue({generatedAt:"2026-10-16",comparisonReady:false,accounts:[{id:5,title:"AOV",viewsGained:100,engagementsGained:4,videosPublished:1}],topVideos:[{id:42,title:"Mic check",accountTitle:"AOV",viewsGained:100,views:1000}],kpis:{viewsGained:100,viewsGainedPrev:10,engagements:4,followers:100,followersGained:1,videosPublished:1}});
});
const ask=(body:unknown)=>POST(new Request("https://local/api/assistant",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
it("uses the selected channel and period and includes evidence links",async()=>{
 const r=await (await ask({question:"What is our top video?",range:"7d",platform:"tiktok",account:5})).json();
 expect(mocks.dashboard.mock.calls[0][1]).toEqual({range:"7d",platform:"tiktok",accountId:5});
 expect(r.sources).toEqual([{title:"Mic check",href:"/library/42"}]);expect(r.answer).toContain("Scope: AOV");
});
it("does not claim growth percentages without baseline coverage",async()=>{
 const r=await (await ask({question:"Are our channels growing?"})).json();
 expect(r.answer).toContain("not have enough");expect(r.answer).not.toContain("900");
});
it("refuses content conclusions when milestones have not been collected",async()=>{
 mocks.insights.mockResolvedValue({items:[],eligible:0});
 const r=await (await ask({question:"Compare meme and mic check after 72 hours",platform:"tiktok",account:5})).json();
 expect(r.answer).toContain("not enough evidence");expect(r.answer).toContain("72-hour");expect(r.sources[0].href).toContain("account=5");
});
