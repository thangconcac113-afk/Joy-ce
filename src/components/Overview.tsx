"use client";

import { useEffect, useState } from "react";
import type { AccountRow, Dashboard, LatestUpload, RangeKey } from "@/lib/metrics";
import type { FilterState } from "./Filters";
import { toQuery } from "./Filters";
import { Img } from "./Img";
import { Kpi } from "./Kpi";
import { Sparkline } from "./Sparkline";
import { TrendChart } from "./TrendChart";
import { useLive } from "./useLive";
import { useFilterState } from "./useFilterState";
import { duration, fmt, fmtFull, PLATFORM_LABEL, signed } from "./format";
import { useI18n } from "./I18n";

const PERIOD: Record<RangeKey, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
const RANGE_SHORT: Record<RangeKey, string> = { "24h": "24h", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
const RANGE_MS: Record<RangeKey, number> = { "24h": 86400_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000, "90d": 90 * 86400_000 };
const color = (p: "youtube" | "tiktok") => (p === "youtube" ? "var(--series-yt)" : "var(--series-tt)");

export function SyncControls({ lastSync, onSynced }: { lastSync: string | null; onSynced: () => void }) {
  const { t, tag, ago } = useI18n();
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
      if (!res.ok) setMsg(body.error ?? t("Sync failed ({status}).", { status: res.status }));
      else setMsg(body.accountsFailed ? t("{n} channel(s) failed. See Channels.", { n: body.accountsFailed }) : null);
      onSynced();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="live" title={lastSync ? new Date(lastSync).toLocaleString(tag) : undefined}>
        <i className={`live-dot ${stale ? "stale" : ""}`} aria-hidden />
        {stale ? t("Data may be stale") : t("Live")} · {t("synced {time}", { time: ago(lastSync) })}
      </span>
      <button className="btn" type="button" onClick={sync} disabled={busy}>
        {busy ? t("Syncing…") : t("Sync now")}
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
  const { t, ago } = useI18n();
  return (
    <button type="button" className="ch-card card" aria-pressed={selected} onClick={onSelect} title={selected ? t("Show all channels") : t("Focus the dashboard on {title}", { title: a.title })}>
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
          <span className="ch-label">{t("Followers")}</span>
          <span className="ch-value" title={fmtFull(a.followers)}>
            {fmt(a.followers)}
          </span>
          <span className="ch-sub">{signed(a.followersGained)}</span>
        </div>
        <div>
          <span className="ch-label">{t("Views · {period}", { period })}</span>
          <span className="ch-value" title={fmtFull(a.viewsGained)}>
            {fmt(a.viewsGained)}
          </span>
          <span className="ch-sub">{t(a.videosPublished === 1 ? "{n} new video" : "{n} new videos", { n: a.videosPublished })}</span>
        </div>
      </div>
      <Sparkline values={trend} color={color(a.platform)} label={`${a.title} views trend`} height={36} />
      <div className="ch-foot">{a.lastError ? <span className="err">{t("⚠ Sync error")}</span> : <span className="muted">{t("Synced {time}", { time: ago(a.lastPolledAt) })}</span>}</div>
    </button>
  );
}

export function Overview() {
  const { t, tag, ago, shortDate } = useI18n();
  const analyticsNote = (a: Dashboard["analytics"], tiktokOnly: boolean) =>
    tiktokOnly
      ? t("YouTube only")
      : a.connected === 0
        ? t("Not connected. Connect YouTube Analytics on the Channels page.")
        : a.connected < a.total
          ? t("{n} of {m} YouTube channels connected", { n: a.connected, m: a.total })
          : t("Last {days} days", { days: a.rangeKey.slice(0, -1) });
  const [f, setF] = useFilterState("tsvt.overview", { range: "7d", platform: "all", account: null });
  const [metric, setMetric] = useState<"views" | "followers">("views");
  const [channelView, setChannelView] = useState<"cards" | "table">("cards");
  const query = toQuery(f);
  const { data, error, loading, reload } = useLive<Dashboard>(`/api/dashboard?${query}`, 60_000);
  // Channel cards always show every channel on the platform, so one can be picked or unpicked.
  const { data: all } = useLive<Dashboard>(`/api/dashboard?${toQuery({ ...f, account: null })}`, 60_000);

  const { data: latest } = useLive<{ items: LatestUpload[] }>(`/api/latest?platform=${f.platform}${f.account ? `&account=${f.account}` : ""}`, 120_000);
  const period = t(PERIOD[f.range]);
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
          <h1>{focused ? focused.title : t("Dashboard")}</h1>
          <p>{focused ? t("{platform} channel · last {period}", { platform: PLATFORM_LABEL[focused.platform], period }) : t("Every Team Secret channel at a glance · last {period}", { period })}</p>
        </div>
        <div className="head-actions">
          <SyncControls lastSync={data?.lastPoll?.finishedAt ?? null} onSynced={reload} />
          <a className="btn btn-primary" href={`/api/export?${query}`}>
            {t("Export CSV")}
          </a>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Filters">
        <div className="seg" aria-label="Date range">
          {(Object.keys(RANGE_SHORT) as RangeKey[]).map((r) => (
            <button key={r} type="button" aria-pressed={f.range === r} onClick={() => setF({ ...f, range: r })}>
              {t(RANGE_SHORT[r])}
            </button>
          ))}
        </div>
        <div className="seg" aria-label="Platform">
          {(["all", "youtube", "tiktok"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={f.platform === p && !focused} onClick={() => setF({ ...f, platform: p, account: null })}>
              {p !== "all" && <span className={`dot ${p === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />}
              {p === "all" ? t("All") : PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
        <select className="select" aria-label={t("Channel")} value={f.account ?? ""} onChange={(e) => setF({ ...f, account: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t("All channels")}</option>
          {(all?.accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="banner" role="alert">
          <span>{t("Couldn't refresh: {error}", { error })}</span>
        </div>
      )}
      {data && all && all.accounts.length === 0 && (
        <div className="banner info">
          <span>
            {t("No channels tracked yet. Add YouTube channels and connect TikTok accounts on the")} <a href="/channels">{t("Channels")}</a>
            {t(" page.")}
          </span>
        </div>
      )}

      {data?.trackingSince && new Date(data.trackingSince).getTime() > new Date(data.generatedAt).getTime() - RANGE_MS[f.range] && (
        <div className="banner info">
          <span>
            {t("Tracking started {time}. Growth before that can't be measured, so this period is incomplete: videos published in it count with all their views, and the charts fill in as new syncs arrive.", {
              time: new Date(data.trackingSince).toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            })}
          </span>
        </div>
      )}

      {data && (
        <div className={loading ? "refetching" : undefined}>
          <div className="kpis">
            <Kpi
              label={t("Total followers")}
              value={data.kpis.followers}
              note={t("{n} net new", { n: signed(data.kpis.followersGained) })}
              current={data.kpis.followersGained}
              previous={data.kpis.followersGainedPrev}
              period={period}
              compareLabel={t("growth vs prev.")}
              trend={total(data.followersSeries)}
              hint={t("YouTube subscribers + TikTok followers. YouTube rounds public subscriber counts, so its growth moves in steps.")}
            />
            <Kpi label={t("Views gained")} value={data.kpis.viewsGained} current={data.kpis.viewsGained} previous={data.kpis.viewsGainedPrev} period={period} compareLabel={t("vs prev.")} trend={total(data.viewsSeries)} hint={t("New views on tracked videos during the period.")} />
            <Kpi label={t("Engagements")} value={data.kpis.engagements} current={data.kpis.engagements} previous={data.kpis.engagementsPrev} period={period} compareLabel={t("vs prev.")} hint={t("New likes + comments + shares on tracked videos.")} />
            <Kpi
              label={t("Avg view duration")}
              value={data.analytics.avdSec ?? 0}
              valueText={data.analytics.avdSec == null ? "—" : (duration(Math.round(data.analytics.avdSec)) ?? "—")}
              noDelta
              note={analyticsNote(data.analytics, f.platform === "tiktok")}
              current={0}
              previous={0}
              period={period}
              hint={t("Average time watched per view (YouTube Analytics, owner-only). Uses the last {days} days.", { days: data.analytics.rangeKey.slice(0, -1) })}
            />
            <Kpi
              label={t("Impressions CTR")}
              value={data.analytics.ctr ?? 0}
              valueText={data.analytics.ctr == null ? "—" : `${data.analytics.ctr.toFixed(1)}%`}
              noDelta
              note={data.analytics.impressions == null ? analyticsNote(data.analytics, f.platform === "tiktok") : t("{n} impressions", { n: fmt(data.analytics.impressions) })}
              current={0}
              previous={0}
              period={period}
              hint={t("How often people click a thumbnail after seeing it (YouTube Analytics, owner-only). Uses the last {days} days.", { days: data.analytics.rangeKey.slice(0, -1) })}
            />
            <Kpi label={t("Videos published")} value={data.kpis.videosPublished} current={data.kpis.videosPublished} previous={data.kpis.videosPublishedPrev} period={period} compareLabel={t("vs prev.")} />
          </div>

          <section className="card section" aria-label={t("New uploads (last 48h)")}>
            <div className="card-head">
              <div>
                <h2 className="card-title">{t("New uploads (last 48h)")}</h2>
              </div>
              <a className="link" href="/library">
                {t("All videos →")}
              </a>
            </div>
            {latest && latest.items.length === 0 && <div className="empty">{t("No new uploads in the last 48 hours.")}</div>}
            <ol className="trend-list">
              {(latest?.items ?? []).slice(0, 6).map((v) => (
                <li key={v.id}>
                  <a href={v.url ?? "#"} target="_blank" rel="noreferrer noopener">
                    <Img className="tthumb" src={v.thumbnailUrl} />
                    <span className="tinfo">
                      <span className="ttitle">{v.title}</span>
                      <span className="tmeta">
                        <i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                        {v.accountTitle} · {t("{h}h ago", { h: Math.round(v.hoursOld) })}
                      </span>
                    </span>
                    <span className="tgain">
                      <b>{fmt(v.views)}</b>
                      <small>{fmt(Math.round(v.viewsPerHour))}/h</small>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <div className="dash-grid">
            <TrendChart
              title={metric === "views" ? t("Views gained") : t("Net new followers")}
              subtitle={t("Per {bucket} · latest {bucket} still in progress", { bucket: t(data.bucket) })}
              data={metric === "views" ? data.viewsSeries : data.followersSeries}
              keys={[...keys]}
              bucket={data.bucket}
              height={262}
              headerExtra={
                <div className="seg" aria-label="Chart metric">
                  <button type="button" aria-pressed={metric === "views"} onClick={() => setMetric("views")}>
                    {t("Views")}
                  </button>
                  <button type="button" aria-pressed={metric === "followers"} onClick={() => setMetric("followers")}>
                    {t("Followers")}
                  </button>
                </div>
              }
            />
            <section className="card trending" aria-label="Trending videos">
              <div className="card-head">
                <div>
                  <h2 className="card-title">{t("Trending now")}</h2>
                  <p className="card-sub">{t("Most views gained · last {period}", { period })}</p>
                </div>
                <a className="link" href="/library">
                  {t("All videos →")}
                </a>
              </div>
              {trending.length === 0 && <div className="empty">{t("No video activity in this period yet.")}</div>}
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
                        <small>{t("{n} total", { n: fmt(v.views) })}</small>
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
                <h2 className="card-title">{t("Channels")}</h2>
                <p className="card-sub">{focused ? t("Click the highlighted card again to show all channels.") : t("Click a channel to focus the whole dashboard on it.")}</p>
              </div>
              <div className="seg" aria-label="Channel view">
                <button type="button" aria-pressed={channelView === "cards"} onClick={() => setChannelView("cards")}>
                  {t("Cards")}
                </button>
                <button type="button" aria-pressed={channelView === "table"} onClick={() => setChannelView("table")}>
                  {t("Table")}
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
                    period={t(RANGE_SHORT[f.range])}
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
                      <th>{t("Channel")}</th>
                      <th className="num">{t("Followers")}</th>
                      <th className="num">{t("Net followers")}</th>
                      <th className="num">{t("Views gained")}</th>
                      <th className="num">{t("Engagements")}</th>
                      <th className="num">{t("Videos")}</th>
                      <th>{t("Last sync")}</th>
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
      {!data && !error && <div className="empty">{t("Loading…")}</div>}
    </>
  );
}
