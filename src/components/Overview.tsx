"use client";

import { useEffect, useState } from "react";
import type { AccountRow, Dashboard, RangeKey } from "@/lib/metrics";
import type { FilterState } from "./Filters";
import { toQuery } from "./Filters";
import { Img } from "./Img";
import { Kpi } from "./Kpi";
import { Sparkline } from "./Sparkline";
import { TrendChart } from "./TrendChart";
import { useLive } from "./useLive";
import { ago, fmt, fmtFull, PLATFORM_LABEL, shortDate, signed } from "./format";

const PERIOD: Record<RangeKey, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
const RANGE_SHORT: Record<RangeKey, string> = { "24h": "24h", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
const RANGE_MS: Record<RangeKey, number> = { "24h": 86400_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000, "90d": 90 * 86400_000 };
const color = (p: "youtube" | "tiktok") => (p === "youtube" ? "var(--series-yt)" : "var(--series-tt)");

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

function ChannelCard({ a, trend, selected, onSelect, period }: { a: AccountRow; trend: number[]; selected: boolean; onSelect: () => void; period: string }) {
  return (
    <button type="button" className="ch-card card" aria-pressed={selected} onClick={onSelect} title={selected ? "Show all channels" : `Focus the dashboard on ${a.title}`}>
      <div className="ch-top">
        <Img className="avatar" src={a.avatarUrl} />
        <div className="ch-name">
          <b>{a.title}</b>
          <span className="platform-tag">
            <i className={`dot ${a.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
            {PLATFORM_LABEL[a.platform]}
          </span>
        </div>
      </div>
      <div className="ch-stats">
        <div>
          <span className="ch-label">Followers</span>
          <span className="ch-value" title={fmtFull(a.followers)}>
            {fmt(a.followers)}
          </span>
          <span className="ch-sub">{signed(a.followersGained)}</span>
        </div>
        <div>
          <span className="ch-label">Views · {period}</span>
          <span className="ch-value" title={fmtFull(a.viewsGained)}>
            {fmt(a.viewsGained)}
          </span>
          <span className="ch-sub">{a.videosPublished} new video{a.videosPublished === 1 ? "" : "s"}</span>
        </div>
      </div>
      <Sparkline values={trend} color={color(a.platform)} label={`${a.title} views trend`} height={36} />
      <div className="ch-foot">{a.lastError ? <span className="err">⚠ Sync error</span> : <span className="muted">Synced {ago(a.lastPolledAt)}</span>}</div>
    </button>
  );
}

export function Overview() {
  const [f, setF] = useState<FilterState>({ range: "7d", platform: "all", account: null });
  const [metric, setMetric] = useState<"views" | "followers">("views");
  const [channelView, setChannelView] = useState<"cards" | "table">("cards");
  const query = toQuery(f);
  const { data, error, loading, reload } = useLive<Dashboard>(`/api/dashboard?${query}`, 60_000);
  // Channel cards always show every channel on the platform, so one can be picked or unpicked.
  const { data: all } = useLive<Dashboard>(`/api/dashboard?${toQuery({ ...f, account: null })}`, 60_000);

  const period = PERIOD[f.range];
  const focused = all?.accounts.find((a) => a.id === f.account) ?? null;
  const keys = focused ? [focused.platform] : f.platform === "all" ? (["youtube", "tiktok"] as const) : ([f.platform] as const);
  // Sparklines leave out the current bucket: it is still filling up and would always dip.
  const complete = (xs: number[]) => xs.slice(0, -1);
  const total = (s: Dashboard["viewsSeries"]) => complete(s.map((p) => p.youtube + p.tiktok));
  const trending = data?.topVideos.filter((v) => v.viewsGained > 0).slice(0, 6) ?? [];
  const maxTrend = Math.max(1, ...trending.map((v) => v.viewsGained));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{focused ? focused.title : "Dashboard"}</h1>
          <p>{focused ? `${PLATFORM_LABEL[focused.platform]} channel · last ${period}` : `Every Team Secret channel at a glance · last ${period}`}</p>
        </div>
        <div className="head-actions">
          <SyncControls lastSync={data?.lastPoll?.finishedAt ?? null} onSynced={reload} />
          <a className="btn btn-primary" href={`/api/export?${query}`}>
            Export CSV
          </a>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Filters">
        <div className="seg" aria-label="Date range">
          {(Object.keys(RANGE_SHORT) as RangeKey[]).map((r) => (
            <button key={r} type="button" aria-pressed={f.range === r} onClick={() => setF({ ...f, range: r })}>
              {RANGE_SHORT[r]}
            </button>
          ))}
        </div>
        <div className="seg" aria-label="Platform">
          {(["all", "youtube", "tiktok"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={f.platform === p && !focused} onClick={() => setF({ ...f, platform: p, account: null })}>
              {p !== "all" && <span className={`dot ${p === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />}
              {p === "all" ? "All" : PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
        {focused && (
          <button type="button" className="chip" onClick={() => setF({ ...f, account: null })}>
            Channel: {focused.title} <span aria-hidden>✕</span>
          </button>
        )}
      </div>

      {error && (
        <div className="banner" role="alert">
          <span>Couldn&apos;t refresh: {error}</span>
        </div>
      )}
      {data && all && all.accounts.length === 0 && (
        <div className="banner info">
          <span>
            No channels tracked yet. Add YouTube channels and connect TikTok accounts on the <a href="/channels">Channels</a> page.
          </span>
        </div>
      )}

      {data?.trackingSince && new Date(data.trackingSince).getTime() > new Date(data.generatedAt).getTime() - RANGE_MS[f.range] && (
        <div className="banner info">
          <span>
            Tracking started {new Date(data.trackingSince).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Growth
            before that can&apos;t be measured, so this period is incomplete: videos published in it count with all their views, and the charts fill in as
            new syncs arrive.
          </span>
        </div>
      )}

      {data && (
        <div className={loading ? "refetching" : undefined}>
          <div className="kpis">
            <Kpi
              label="Total followers"
              value={data.kpis.followers}
              note={`${signed(data.kpis.followersGained)} net new`}
              current={data.kpis.followersGained}
              previous={data.kpis.followersGainedPrev}
              period={period}
              compareLabel="growth vs prev."
              trend={total(data.followersSeries)}
              hint="YouTube subscribers + TikTok followers. YouTube rounds public subscriber counts, so its growth moves in steps."
            />
            <Kpi label="Views gained" value={data.kpis.viewsGained} current={data.kpis.viewsGained} previous={data.kpis.viewsGainedPrev} period={period} compareLabel="vs prev." trend={total(data.viewsSeries)} hint="New views on tracked videos during the period." />
            <Kpi label="Engagements" value={data.kpis.engagements} current={data.kpis.engagements} previous={data.kpis.engagementsPrev} period={period} compareLabel="vs prev." hint="New likes + comments + shares on tracked videos." />
            <Kpi label="Videos published" value={data.kpis.videosPublished} current={data.kpis.videosPublished} previous={data.kpis.videosPublishedPrev} period={period} compareLabel="vs prev." />
          </div>

          <div className="dash-grid">
            <TrendChart
              title={metric === "views" ? "Views gained" : "Net new followers"}
              subtitle={`Per ${data.bucket} · latest ${data.bucket} still in progress`}
              data={metric === "views" ? data.viewsSeries : data.followersSeries}
              keys={[...keys]}
              bucket={data.bucket}
              height={262}
              headerExtra={
                <div className="seg" aria-label="Chart metric">
                  <button type="button" aria-pressed={metric === "views"} onClick={() => setMetric("views")}>
                    Views
                  </button>
                  <button type="button" aria-pressed={metric === "followers"} onClick={() => setMetric("followers")}>
                    Followers
                  </button>
                </div>
              }
            />
            <section className="card trending" aria-label="Trending videos">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Trending now</h2>
                  <p className="card-sub">Most views gained · last {period}</p>
                </div>
                <a className="link" href="/library">
                  All videos →
                </a>
              </div>
              {trending.length === 0 && <div className="empty">No video activity in this period yet.</div>}
              <ol className="trend-list">
                {trending.map((v, i) => (
                  <li key={v.id}>
                    <a href={v.url ?? "#"} target="_blank" rel="noreferrer noopener">
                      <span className="rank">{i + 1}</span>
                      <Img className="tthumb" src={v.thumbnailUrl} />
                      <span className="tinfo">
                        <span className="ttitle">{v.title}</span>
                        <span className="tmeta">
                          <i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                          {v.accountTitle} · {shortDate(v.publishedAt)}
                        </span>
                        <span className="tbar" style={{ width: `${Math.max(3, (v.viewsGained / maxTrend) * 100)}%`, background: color(v.platform) }} aria-hidden />
                      </span>
                      <span className="tgain">
                        <b>{signed(v.viewsGained)}</b>
                        <small>{fmt(v.views)} total</small>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section className="section" aria-label="Channels">
            <div className="section-bar">
              <div>
                <h2 className="card-title">Channels</h2>
                <p className="card-sub">{focused ? "Click the highlighted card again to show all channels." : "Click a channel to focus the whole dashboard on it."}</p>
              </div>
              <div className="seg" aria-label="Channel view">
                <button type="button" aria-pressed={channelView === "cards"} onClick={() => setChannelView("cards")}>
                  Cards
                </button>
                <button type="button" aria-pressed={channelView === "table"} onClick={() => setChannelView("table")}>
                  Table
                </button>
              </div>
            </div>
            {channelView === "cards" ? (
              <div className="ch-grid">
                {(all?.accounts ?? data.accounts).map((a) => (
                  <ChannelCard
                    key={a.id}
                    a={a}
                    trend={(all?.accountViewsSeries[a.id] ?? []).slice(0, -1)}
                    period={RANGE_SHORT[f.range]}
                    selected={f.account === a.id}
                    onSelect={() => setF({ ...f, account: f.account === a.id ? null : a.id })}
                  />
                ))}
              </div>
            ) : (
              <div className="card table-wrap">
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
                    {(all?.accounts ?? data.accounts).map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="platform-tag" style={{ color: "var(--ink)", fontWeight: 600 }}>
                            <i className={`dot ${a.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                            {a.title}
                          </span>
                        </td>
                        <td className="num">{fmtFull(a.followers)}</td>
                        <td className="num">{signed(a.followersGained)}</td>
                        <td className="num">{fmtFull(a.viewsGained)}</td>
                        <td className="num">{fmtFull(a.engagementsGained)}</td>
                        <td className="num">{a.videosPublished}</td>
                        <td>{a.lastError ? <span className="err">⚠ {a.lastError.slice(0, 60)}</span> : <span className="muted">{ago(a.lastPolledAt)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      {!data && !error && <div className="empty">Loading…</div>}
    </>
  );
}
