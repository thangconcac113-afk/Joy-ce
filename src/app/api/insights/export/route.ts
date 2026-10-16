import { GET as readInsights } from "../route";
import { csvLine } from "@/lib/csv";
import type { InsightVideo } from "@/lib/insights";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const response=await readInsights(req);if(!response.ok)return response;
 const data=await response.json();
 const lines=[csvLine(["Content insights",`${data.hours}-hour milestone`,`${data.days}-day publication window`,data.generatedAt]),csvLine(["Video","Channel","Platform","Published","Hashtags","Content type","Game","Campaign","Editor","Lifetime views","Measured milestone views","Milestone sample at","Video detail"]),...data.items.map((v:InsightVideo)=>csvLine([v.title,v.accountTitle,v.platform,v.publishedAt,(v.hashtags||[]).map(t=>`#${t}`).join(" "),v.contentType,v.game,v.campaign,v.editor,v.views,v.ageViews,v.ageSampleAt,`${new URL(req.url).origin}/library/${v.id}`]))];
 return new Response("\uFEFF"+lines.join("\r\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=campaign-videos.csv"}});
}
