"use client";

import { useEffect, useState } from "react";
import type { VideoRow } from "@/lib/metrics";
import { Filters, toQuery, type FilterState } from "./Filters";
import { useLive } from "./useLive";
import { date, duration, fmt, signed } from "./format";

type Sort = "newest" | "views" | "trending";

export function Library() {
  const [f, setF] = useState<FilterState>({ range: "24h", platform: "all", account: null });
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => setPage(1), [f, debounced, sort]);

  const { data, error, loading } = useLive<{ total: number; items: VideoRow[] }>(`/api/videos?${toQuery(f, { q: debounced, sort, page })}`, 120_000);
  const pages = data ? Math.max(1, Math.ceil(data.total / 24)) : 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Video library</h1>
          <p>Every tracked video with its latest numbers and views gained in the last 24 hours.</p>
        </div>
      </div>
      <div className="filters">
        <input className="input" type="search" placeholder="Search video titles…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search videos" />
        <div className="seg" aria-label="Sort">
          {(
            [
              ["newest", "Newest"],
              ["trending", "Trending (24h)"],
              ["views", "Most viewed"],
            ] as [Sort, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Filters value={f} onChange={setF} showRange={false} />
      {error && (
        <div className="banner" role="alert">
          Couldn&apos;t load videos: {error}
        </div>
      )}
      <section className={`card ${loading && data ? "refetching" : ""}`} aria-label="Videos">
        {data && data.items.length === 0 && <div className="empty">No videos match these filters.</div>}
        <div className="grid">
          {data?.items.map((v) => (
            <a key={v.id} className="tile" href={v.url ?? "#"} target="_blank" rel="noreferrer noopener">
              <div className="tile-media">
                {/* Vertical TikTok covers sit inside the same 16:9 frame over a blurred fill, so the grid stays even. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {v.thumbnailUrl && v.platform === "tiktok" && <img className="blur" src={v.thumbnailUrl} alt="" loading="lazy" aria-hidden />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {v.thumbnailUrl && <img className={v.platform === "tiktok" ? "fg" : undefined} src={v.thumbnailUrl} alt="" loading="lazy" />}
                {v.viewsGained > 0 && <span className="tile-trend">{signed(v.viewsGained)} today</span>}
                {duration(v.durationSec) && <span className="tile-badge">{duration(v.durationSec)}</span>}
              </div>
              <div className="tile-meta">
                <i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                {v.accountTitle}
              </div>
              <div className="tile-title">{v.title}</div>
              <div className="tile-stats">
                <span>{date(v.publishedAt)}</span>
                <span>
                  {fmt(v.views)} views · {fmt(v.likes)} likes
                </span>
              </div>
            </a>
          ))}
        </div>
        {data && data.total > 0 && (
          <div className="pager">
            <span>
              {data.total} videos · Page {page} of {pages}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn" type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </span>
          </div>
        )}
      </section>
    </>
  );
}
