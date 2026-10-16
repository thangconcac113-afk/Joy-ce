"use client";

import { LoadingState } from "./LoadingState";
import { HashtagOptions } from "./HashtagOptions";
import { CONTENT_TYPES } from "@/lib/insights";
import { useEffect, useState } from "react";
import type { VideoRow } from "@/lib/metrics";
import { Filters, useAccountOptions, toQuery, type FilterState } from "./Filters";
import { Img } from "./Img";
import { useLive } from "./useLive";
import { useFilterState } from "./useFilterState";
import { duration, fmt, signed } from "./format";
import { useI18n } from "./I18n";

type Sort = "newest" | "views" | "trending";

export function Library() {
  const { t, date } = useI18n();
  const [f, setF] = useFilterState("tsvt.library", { range: "24h", platform: "all", account: null });
  const accounts = useAccountOptions();
  const [view, setView] = useState<"list" | "grid">("list");
  const [more, setMore] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [hashtag,setHashtag] = useState("");
  useEffect(()=>{setHashtag(new URLSearchParams(window.location.search).get("hashtag")||"");},[]);
  const changeHashtag=(value:string)=>{setHashtag(value);const q=new URLSearchParams(window.location.search);if(value)q.set("hashtag",value);else q.delete("hashtag");window.history.replaceState(null,"",`${window.location.pathname}?${q}`);};
  const [length,setLength] = useState("");
  const [publishedDays,setPublishedDays] = useState("");
  const [contentType,setContentType] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => setPage(1), [f, debounced, sort, length, publishedDays, contentType, hashtag]);

  const { data, error, loading } = useLive<{ total: number; items: VideoRow[] }>(`/api/videos?${toQuery(f, { q: debounced, sort, page, duration:length, days:publishedDays, type:contentType, hashtag })}`, 120_000);
  const pages = data ? Math.max(1, Math.ceil(data.total / 24)) : 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Video library")}</h1>
          <p>{t("Every tracked video with its latest numbers and views gained in the last 24 hours.")}</p>
        </div>
      </div>
      <HashtagOptions platform={f.platform} account={f.account} id="library-hashtags" />
      <div className="library-toolbar">
        <label className="filter-field search-field"><span className="control-label">Search videos</span><input className="input" type="search" placeholder={t("Search video titles…")} value={q} onChange={e => setQ(e.target.value)} aria-label="Search videos" /></label>
        <label className="filter-field"><span className="control-label">Channel</span><select className="select" aria-label="Channel" value={f.account ?? ""} onChange={e => {
          const selected = accounts.find(a => a.id === Number(e.target.value));
          setF({ ...f, account: selected?.id ?? null, platform: selected?.platform ?? "all" });
        }}><option value="">All channels</option>{(["youtube", "tiktok"] as const).map(platform => <optgroup key={platform} label={platform === "youtube" ? "YouTube" : "TikTok"}>{accounts.filter(a => a.platform === platform).map(a => <option key={a.id} value={a.id}>{a.title} ({platform === "youtube" ? "YouTube" : "TikTok"})</option>)}</optgroup>)}</select></label>
        <label className="filter-field"><span className="control-label">Campaign hashtag</span><input className="input" list="library-hashtags" aria-label="Search hashtag" placeholder="#EWC, #VCT or #TSW" maxLength={100} value={hashtag} onChange={e => changeHashtag(e.target.value)} /></label>
        <button className="btn" type="button" aria-expanded={more} aria-controls="library-more-filters" onClick={() => setMore(!more)}>More filters{[length, publishedDays, contentType, f.platform !== "all"].filter(Boolean).length > 0 && ` (${[length, publishedDays, contentType, f.platform !== "all"].filter(Boolean).length})`}</button>
      </div>
      {more && <div className="advanced-filters" id="library-more-filters">
        <Filters value={f} onChange={setF} showRange={false} showChannel={false} />
        <label className="filter-field"><span className="control-label">Video duration</span><select className="select" aria-label="Video duration" value={length} onChange={e => setLength(e.target.value)}><option value="">All durations</option><option value="short">Up to 60 seconds</option><option value="medium">61-180 seconds</option><option value="long">Over 3 minutes</option></select></label>
        <label className="filter-field"><span className="control-label">Published in</span><select className="select" aria-label="Publication period" value={publishedDays} onChange={e => setPublishedDays(e.target.value)}><option value="">All tracked dates</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option></select></label>
        <label className="filter-field"><span className="control-label">Content type</span><select className="select" aria-label="Content type" value={contentType} onChange={e => setContentType(e.target.value)}><option value="">All content types</option>{CONTENT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
      </div>}
      <div className="active-filters" aria-label="Active filters">
        {q && <button className="filter-chip" onClick={() => setQ("")} aria-label="Remove search filter">Search: {q} ×</button>}
        {hashtag && <button className="filter-chip" onClick={() => changeHashtag("")} aria-label="Remove hashtag filter">#{hashtag.replace(/^#/, "")} ×</button>}
        {f.account && <button className="filter-chip" onClick={() => setF({ ...f, account: null })} aria-label="Remove channel filter">{accounts.find(a => a.id === f.account)?.title ?? "Channel"} ×</button>}
        {f.platform !== "all" && <button className="filter-chip" onClick={() => setF({ ...f, platform: "all" })} aria-label="Remove platform filter">{f.platform === "youtube" ? "YouTube" : "TikTok"} ×</button>}
        {length && <button className="filter-chip" onClick={() => setLength("")} aria-label="Remove duration filter">{length === "short" ? "Up to 60s" : length === "medium" ? "61–180s" : "Over 3 min"} ×</button>}
        {publishedDays && <button className="filter-chip" onClick={() => setPublishedDays("")} aria-label="Remove publication filter">Last {publishedDays} days ×</button>}
        {contentType && <button className="filter-chip" onClick={() => setContentType("")} aria-label="Remove content type filter">{contentType} ×</button>}
        {(q || hashtag || f.account || f.platform !== "all" || length || publishedDays || contentType) && <button className="clear-filters" onClick={() => { setQ(""); changeHashtag(""); setF({ ...f, platform: "all", account: null }); setLength(""); setPublishedDays(""); setContentType(""); }}>Clear all</button>}
      </div>
      <div className="library-viewbar"><div className="seg" aria-label="Sort">{([["newest", "Newest"], ["trending", "Trending (24h)"], ["views", "Most viewed"]] as [Sort, string][]).map(([key, label]) => <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}>{t(label)}</button>)}</div><div className="seg" aria-label="Video view"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button><button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button></div></div>
      {error && (
        <div className="banner" role="alert">
          {t("Couldn't load videos: {error}", { error })}
        </div>
      )}
      {!data && !error && <LoadingState kind="library" />}
      {data && <section className={`card ${loading && data ? "refetching" : ""}`} aria-label="Videos" aria-busy={loading}>
        {data && data.items.length === 0 && <div className="empty">{t("No videos match these filters.")}</div>}
        {view === "list" ? <div className="table-wrap"><table className="data video-table"><thead><tr><th>Video</th><th>Published</th><th className="num">Views gained · 24h</th><th className="num">Total views</th><th className="num"><abbr title="Lifetime interactions divided by lifetime views. YouTube: likes + comments. TikTok: likes + comments + shares.">Engagement / views</abbr></th></tr></thead><tbody>{data.items.map(v => <tr key={v.id}>
          <td><a className="video-link" href={`/library/${v.id}`}><Img className="tthumb" src={v.thumbnailUrl} /><span className="tinfo"><span className="list-video-title" title={v.title}>{v.title}</span><span className="tmeta"><i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />{v.accountTitle} · {v.platform === "youtube" ? "YouTube" : "TikTok"}{duration(v.durationSec) && ` · ${duration(v.durationSec)}`}</span></span></a></td>
          <td>{date(v.publishedAt)}</td><td className="num gained-value"><span className="mobile-cell-label">Gained · 24h</span>{signed(v.viewsGained)}</td><td className="num"><span className="mobile-cell-label">Total views</span>{fmt(v.views)}</td><td className="num"><span className="mobile-cell-label">Engagement rate</span>{v.views > 0 ? `${((v.likes + v.comments + (v.platform === "tiktok" ? v.shares : 0)) / v.views * 100).toFixed(1)}%` : "—"}</td>
        </tr>)}</tbody></table></div> : <div className="grid">
          {data?.items.map((v) => (
            <a key={v.id} className="tile" href={`/library/${v.id}`}>
              <div className="tile-media">
                {/* Vertical TikTok covers sit inside the same 16:9 frame over a blurred fill, so the grid stays even. */}
                {v.thumbnailUrl && v.platform === "tiktok" && <Img className="blur" src={v.thumbnailUrl} />}
                {v.thumbnailUrl && <Img className={v.platform === "tiktok" ? "fg" : undefined} src={v.thumbnailUrl} />}
                {v.viewsGained > 0 && <span className="tile-trend">{t("{n} today", { n: signed(v.viewsGained) })}</span>}
                {duration(v.durationSec) && <span className="tile-badge">{duration(v.durationSec)}</span>}
              </div>
              <div className="tile-meta">
                <i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                {v.accountTitle}
              </div>
              <div className="tile-title" title={v.title}>{v.title}</div>
              <div className="tile-stats">
                <span>{date(v.publishedAt)}</span>
                {(v.avdSec != null || v.ctr != null) && (
                  <span title={t("YouTube Analytics, last 28 days")}>
                    {v.avdSec != null && `${t("AVD")} ${duration(Math.round(v.avdSec))}`}
                    {v.avdSec != null && v.ctr != null && " · "}
                    {v.ctr != null && `${t("CTR")} ${v.ctr.toFixed(1)}%`}
                  </span>
                )}
                <span>
                  {t("{views} views · {likes} likes", { views: fmt(v.views), likes: fmt(v.likes) })}
                </span>
              </div>
            </a>
          ))}
        </div>}
        {data && data.total > 0 && (
          <div className="pager">
            <span>
              {t("{total} videos · Page {page} of {pages}", { total: data.total, page, pages })}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("Previous")}
              </button>
              <button className="btn" type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t("Next")}
              </button>
            </span>
          </div>
        )}
      </section>}
    </>
  );
}
