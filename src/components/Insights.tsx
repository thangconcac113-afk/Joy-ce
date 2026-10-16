"use client";
import { LoadingState } from "./LoadingState";
import { HashtagOptions } from "./HashtagOptions";
import { useState, useEffect } from "react";
import { useLive } from "./useLive";
import { Filters, toQuery } from "./Filters";
import { useFilterState } from "./useFilterState";
import { CONTENT_TYPES, type InsightVideo } from "@/lib/insights";
import { fmtFull, PLATFORM_LABEL } from "./format";
import { Img } from "./Img";
type Group = { key:string; label:string; accountTitle:string; platform:"youtube"|"tiktok"; length:string; videos:number; samples:number; medianViews:number|null; medianEngagementRate:number|null };
export function Insights() {
  const [f,setF] = useFilterState("tsvt.insights",{range:"90d",platform:"all",account:null});
  const [hours,setHours] = useState(168); const [days,setDays] = useState(90); const [type,setType] = useState(""); const [group,setGroup] = useState("contentType");
  const [hashtag,setHashtag] = useState("");
  useEffect(()=>{setHashtag(new URLSearchParams(window.location.search).get("hashtag")||"");},[]);
  const changeHashtag=(value:string)=>{setHashtag(value);const q=new URLSearchParams(window.location.search);if(value)q.set("hashtag",value);else q.delete("hashtag");window.history.replaceState(null,"",`${window.location.pathname}?${q}`);};
  const [campaign,setCampaign] = useState("");
  const qs = `${toQuery(f)}&hours=${hours}&days=${days}&type=${encodeURIComponent(type)}&group=${group}&campaign=${encodeURIComponent(campaign)}&hashtag=${encodeURIComponent(hashtag)}`;
  const {data,error,loading} = useLive<{items:InsightVideo[];groups:Group[];eligible:number}>(`/api/insights?${qs}`,120000);
  return <>
    <div className="page-head"><div><h1>Content insights</h1><p>Find repeatable winners, compared at the same age within each channel.</p></div><div className="head-actions"><a className="btn" href={`/api/insights/export?${qs}`}>Export filtered CSV</a><a className="btn" href="/library">Tag videos in library</a></div></div>
    <HashtagOptions platform={f.platform} account={f.account} id="insight-hashtags"/>
    <Filters value={f} onChange={setF} showRange={false}/>
    <div className="filters insight-filters">
      <label>Hashtag<input className="input" list="insight-hashtags" maxLength={100} value={hashtag} onChange={e=>changeHashtag(e.target.value)} placeholder="#EWC, #VCT or #TSW"/></label>
      <label>Published in<select className="select" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></select></label>
      <label>Compare at age<select className="select" value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={24}>24 hours</option><option value={72}>72 hours</option><option value={168}>7 days</option></select></label>
      <label>Content type<select className="select" value={type} onChange={e=>setType(e.target.value)}><option value="">All content types</option>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Group by<select className="select" value={group} onChange={e=>setGroup(e.target.value)}><option value="contentType">Content type</option><option value="game">Game</option><option value="campaign">Campaign</option><option value="editor">Editor</option></select></label>
      <label>Campaign<input className="input" value={campaign} maxLength={80} onChange={e=>setCampaign(e.target.value)} placeholder="Exact campaign name"/></label>
    </div>
    {error && <div className="banner" role="alert">{error}</div>}
    <div className="banner info">Only videos tracked before publication with an observation in the final hour before the selected milestone are compared. Older imports stay unscored. Duration bands describe length, not verified Shorts format.</div>
    {data && <>
      <div className="section-bar"><h2 className="card-title">Performance by {group === "contentType" ? "content type" : group}</h2><span className="muted">{data.eligible} of {data.items.length} videos have a measured milestone</span></div>
      <section className="card table-wrap section"><table className="data"><thead><tr><th>Group / channel</th><th>Duration</th><th className="num">Videos</th><th className="num">Measured</th><th className="num">Median views at {hours ===168 ? "7d" : `${hours}h`}</th><th className="num">Median engagement rate</th></tr></thead><tbody>
        {data.groups.map(g=><tr key={g.key}><td><b>{g.label}</b><div className="muted">{g.accountTitle} · {PLATFORM_LABEL[g.platform]}</div></td><td>{g.length}</td><td className="num">{g.videos}</td><td className="num">{g.samples}{g.samples>0&&g.samples<5&&<small className="sample-note">Small sample</small>}</td><td className="num">{g.medianViews==null ? "Not enough history" : fmtFull(g.medianViews)}</td><td className="num">{g.medianEngagementRate==null ? "Unavailable" : `${g.medianEngagementRate.toFixed(2)}%`}</td></tr>)}
        {!data.groups.length&&<tr><td colSpan={6}>No videos match these filters.</td></tr>}
      </tbody></table></section>
      <p className="muted">Engagement rate = (likes + comments + available shares) / views at the milestone. YouTube shares are unavailable here. Compare rates within the same platform. Editor groups describe content results, not individual performance ratings.</p>
      <h2 className="card-title">Explore videos</h2>
      <section className="card table-wrap section"><table className="data"><thead><tr><th>Video</th><th>Tags</th><th className="num">Lifetime views</th><th className="num">Views at milestone</th></tr></thead><tbody>
        {data.items.map(v=><tr key={v.id}><td><a className="video-link" href={`/library/${v.id}`}><Img className="tthumb" src={v.thumbnailUrl}/><span>{v.title}<small className="sample-note">{v.accountTitle} · {new Date(v.publishedAt).toLocaleDateString("en-GB")}</small></span></a></td><td>{v.contentType||"Untagged"}<small className="sample-note">{[v.game,v.campaign].filter(Boolean).join(" · ")}</small></td><td className="num">{fmtFull(v.views)}</td><td className="num">{v.ageViews==null ? "Unscored" : fmtFull(v.ageViews)}</td></tr>)}
      </tbody></table></section>
    </>}
    {!data&&!error&&<LoadingState />}
  </>;
}
