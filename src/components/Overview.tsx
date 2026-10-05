"use client";

import { useEffect, useState } from "react";
import type { Dashboard } from "@/lib/metrics";
import { Filters, toQuery, type FilterState } from "./Filters";
import { Kpi } from "./Kpi";
import { TrendChart } from "./TrendChart";
import { useLive } from "./useLive";
import { ago, date, fmt, fmtFull, PLATFORM_LABEL, signed } from "./format";

const PERIOD: Record<FilterState["range"], string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" };

export function SyncControls({ lastSync, onSynced }: { lastSync: string | null; onSynced: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const stale = !lastSync || Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000;
  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(body.error ?? `Sync failed (${res.status}).`);
      else setMsg(body.accountsFailed ? `${body.accountsFailed} channel(s) failed. See Channels.` : null);
      onSynced();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="live" title={lastSync ? new Date(lastSync).toLocaleString("en-GB") : undefined}>
        <i className={`live-dot ${stale ? "stale" : ""}`} aria-hidden />
        {stale ? "Data may be stale" : "Live"} · synced {ago(lastSync)}
      </span>
      <button className="btn" type="button" onClick={sync} disabled={busy}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {msg && (
        <span className="err" role="status">
          {msg}
        </span>
      )}
    </>
  );
}

function Bar({ value, max, platform }: { value: number; max: number; platform: "youtube" | "tiktok" }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 72)) : 2;
  return <span className="bar" style={{ width: w, background: platform === "youtube" ? "var(--series-yt)" : "var(--series-tt)" }} aria-hidden />;
}

export function Overview() {
  const [f, setF] = useState<FilterState>({ range: "7d", platform: "all", account: null });
  const query = toQuery(f);
  const { data, error, loading, reload } = useLive<Dashboard>(`/api/dashboard?${query}`, 60_000);
  const keys = f.platform === "all" ? (["youtube", "tiktok"] as const) : ([f.platform] as const);
  const period = PERIOD[f.range];
  const maxAcct = Math.max(0, ...(data?.accounts.map((a) => a.viewsGained) ?? []));
  const maxVid = Math.max(0, ...(data?.topVideos.map((v) => v.viewsGained) ?? []));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Live performance across Team Secret YouTube and TikTok channels.</p>
        </div>
        <div className="head-actions">
          <SyncControls lastSync={data?.lastPoll?.finishedAt ?? null} onSynced={reload} />
          <a className="btn btn-primary" href={`/api/export?${query}`}>
            Export CSV
          </a>
        </div>
      </div>

      <Filters value={f} onChange={setF} />

      {error && (
        <div className="banner" role="alert">
          <span>Couldn&apos;t refresh: {error}</span>
        </div>
      )}
      {data && data.accounts.length === 0 && (
        <div className="banner info">
          <span>
            No channels tracked yet. Add YouTube channels and connect TikTok accounts on the <a href="/channels">Channels</a> page.
          </span>
        </div>
      )}

      {data && (
        <div className={loading ? "refetching" : undefined}>
          <div className="kpis">
            <Kpi
              label="Total followers"
              value={data.kpis.followers}
              note={`${signed(data.kpis.followersGained)} net new · ${period}`}
              current={data.kpis.followersGained}
              previous={data.kpis.followersGainedPrev}
              period={period}
              compareLabel={`growth vs previous ${period}`}
              hint="YouTube subscribers + TikTok followers. YouTube rounds public subscriber counts (3 significant figures), so its growth moves in steps."
            />
            <Kpi label={`Views gained · ${period}`} value={data.kpis.viewsGained} current={data.kpis.viewsGained} previous={data.kpis.viewsGainedPrev} period={period} hint="New views on tracked videos during the period." />
            <Kpi label={`Engagements · ${period}`} value={data.kpis.engagements} current={data.kpis.engagements} previous={data.kpis.engagementsPrev} period={period} hint="New likes + comments + shares on tracked videos." />
            <Kpi label={`Videos published · ${period}`} value={data.kpis.videosPublished} current={data.kpis.videosPublished} previous={data.kpis.videosPublishedPrev} period={period} />
          </div>

          <div className="charts">
            <TrendChart title="Views gained" subtitle={`New views per ${data.bucket} · latest ${data.bucket} still in progress`} data={data.viewsSeries} keys={[...keys]} bucket={data.bucket} />
            <TrendChart title="Net new followers" subtitle={`Followers gained per ${data.bucket} · latest ${data.bucket} still in progress`} data={data.followersSeries} keys={[...keys]} bucket={data.bucket} />
          </div>

          <section className="card section" aria-label="Channel performance">
            <div className="section-head">
              <div>
                <h2 className="card-title">Channel performance</h2>
                <p className="card-sub">Last {period}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th className="num">Followers</th>
                    <th className="num">Net followers</th>
                    <th className="num">Views gained</th>
                    <th className="num">Engagements</th>
                    <th className="num">Videos</th>
                    <th>Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="who">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {a.avatarUrl ? <img className="avatar" src={a.avatarUrl} alt="" /> : <span className="avatar" />}
                          <div>
                            <div style={{ fontWeight: 600 }}>{a.title}</div>
                            <span className="platform-tag">
                              <i className={`dot ${a.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                              {PLATFORM_LABEL[a.platform]}
                              {a.handle ? ` · ${a.handle}` : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="num" title={fmtFull(a.followers)}>
                        {fmt(a.followers)}
                      </td>
                      <td className="num">{signed(a.followersGained)}</td>
                      <td className="num">
                        <div className="bar-cell">
                          {fmt(a.viewsGained)}
                          <Bar value={a.viewsGained} max={maxAcct} platform={a.platform} />
                        </div>
                      </td>
                      <td className="num">{fmt(a.engagementsGained)}</td>
                      <td className="num">{a.videosPublished}</td>
                      <td>{a.lastError ? <span className="err">⚠ {a.lastError.slice(0, 60)}</span> : <span className="muted">{ago(a.lastPolledAt)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card section" aria-label="Top videos">
            <div className="section-head">
              <div>
                <h2 className="card-title">Top videos</h2>
                <p className="card-sub">Ranked by views gained in the last {period}</p>
              </div>
              <a className="btn" href="/library">
                Open video library
              </a>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Video</th>
                    <th>Channel</th>
                    <th>Published</th>
                    <th className="num">Views gained</th>
                    <th className="num">Total views</th>
                    <th className="num">Engagements</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topVideos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No video activity in this period yet.
                      </td>
                    </tr>
                  )}
                  {data.topVideos.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <a href={v.url ?? "#"} target="_blank" rel="noreferrer noopener" className="who" style={{ textDecoration: "none" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {v.thumbnailUrl ? <img className="vthumb" src={v.thumbnailUrl} alt="" loading="lazy" /> : <span className="vthumb" />}
                          <span className="vtitle">{v.title}</span>
                        </a>
                      </td>
                      <td>
                        <span className="platform-tag">
                          <i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                          {v.accountTitle}
                        </span>
                      </td>
                      <td className="muted">{date(v.publishedAt)}</td>
                      <td className="num">
                        <div className="bar-cell">
                          {signed(v.viewsGained)}
                          <Bar value={v.viewsGained} max={maxVid} platform={v.platform} />
                        </div>
                      </td>
                      <td className="num">{fmt(v.views)}</td>
                      <td className="num">{fmt(v.likes + v.comments + v.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {!data && !error && <div className="empty">Loading…</div>}
    </>
  );
}
