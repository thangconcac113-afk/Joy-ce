"use client";

import { useState } from "react";
import type { MonthlyReport } from "@/lib/metrics";
import { Img } from "./Img";
import { Kpi } from "./Kpi";
import { useLive } from "./useLive";
import { useI18n } from "./I18n";
import { duration, fmt, fmtFull, PLATFORM_LABEL, pctChange, signed } from "./format";

/** The last 6 months, newest first, as "YYYY-MM". */
function recentMonths(now = new Date()) {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function Report() {
  const { t, tag, date } = useI18n();
  const months = recentMonths();
  const [month, setMonth] = useState(months[0]);
  const { data, error } = useLive<MonthlyReport>(`/api/report?month=${month}`, 120_000);
  const label = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(tag, { month: "long", year: "numeric" });

  const k = data?.kpis;
  const pct = k ? pctChange(k.viewsGained, k.viewsGainedPrev) : null;
  const top = data?.topVideos[0];
  const partial = data?.trackingSince && new Date(data.trackingSince) > new Date(`${month}-02T00:00:00`);

  const summary =
    data && k
      ? [
          t("In {month}, Team Secret channels gained {views} views ({change}), {followers} net new followers and {engagements} engagements, with {videos} videos published.", {
            month: label(month),
            views: fmtFull(k.viewsGained),
            change: pct === null ? t("no previous month to compare") : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% ${t("vs previous month")}`,
            followers: signed(k.followersGained),
            engagements: fmtFull(k.engagements),
            videos: k.videosPublished,
          }),
          top ? t("Top video: “{title}” ({channel}) with {n} views gained.", { title: top.title, channel: top.accountTitle, n: fmtFull(top.viewsGained) }) : "",
          data.avdSec != null ? t("Average view duration over the last 30 days is {avd}.", { avd: duration(Math.round(data.avdSec)) ?? "" }) : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Monthly report")}</h1>
          <p>{data ? `${label(month)} · ${data.complete ? t("final numbers") : t("month in progress, updates automatically")}` : "…"}</p>
        </div>
        <div className="head-actions no-print">
          <select className="select" aria-label={t("Month")} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
          <a className="btn" href={`/api/report/export?month=${month}`}>
            {t("Export CSV")}
          </a>
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>
            {t("Print / Save PDF")}
          </button>
        </div>
      </div>

      {error && (
        <div className="banner" role="alert">
          {t("Couldn't load videos: {error}", { error })}
        </div>
      )}
      {partial && (
        <div className="banner info">
          <span>{t("Tracking only started on {day}, so this month is incomplete.", { day: date(data!.trackingSince) })}</span>
        </div>
      )}

      {data && k && (
        <>
          <section className="card report-summary" aria-label={t("Summary")}>
            <p>{summary}</p>
          </section>

          <div className="kpis">
            <Kpi label={t("Views gained")} value={k.viewsGained} current={k.viewsGained} previous={k.viewsGainedPrev} period="" compareLabel={t("vs previous month")} />
            <Kpi label={t("Engagements")} value={k.engagements} current={k.engagements} previous={k.engagementsPrev} period="" compareLabel={t("vs previous month")} />
            <Kpi label={t("Net followers")} value={k.followersGained} valueText={signed(k.followersGained)} current={k.followersGained} previous={k.followersGainedPrev} period="" compareLabel={t("vs previous month")} note={t("{n} total followers", { n: fmt(k.followers) })} />
            <Kpi
              label={t("Videos published")}
              value={k.videosPublished}
              current={k.videosPublished}
              previous={k.videosPublishedPrev}
              period=""
              compareLabel={t("vs previous month")}
              noDelta={!data.complete}
              note={data.complete ? undefined : t("Month in progress: {n} days counted so far", { n: new Date().getDate() })}
            />
            <Kpi
              label={t("Avg view duration")}
              value={data.avdSec ?? 0}
              valueText={data.avdSec == null ? "—" : (duration(Math.round(data.avdSec)) ?? "—")}
              noDelta
              note={data.avdSec == null ? t("Not connected. Connect YouTube Analytics on the Channels page.") : t("Last {days} days", { days: 30 })}
              current={0}
              previous={0}
              period=""
            />
          </div>

          <section className="card table-wrap section" aria-label={t("Channels")}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("Channel")}</th>
                  <th className="num">{t("Followers")}</th>
                  <th className="num">{t("Net followers")}</th>
                  <th className="num">{t("Views gained")}</th>
                  <th className="num">{t("Engagements")}</th>
                  <th className="num">{t("Videos")}</th>
                  <th className="num">{t("AVD")}</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="platform-tag" style={{ color: "var(--ink)", fontWeight: 600 }}>
                        <i className={`dot ${a.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                        {a.title} <small className="muted">{PLATFORM_LABEL[a.platform]}</small>
                      </span>
                    </td>
                    <td className="num">{fmtFull(a.followers)}</td>
                    <td className="num">{signed(a.followersGained)}</td>
                    <td className="num">{fmtFull(a.viewsGained)}</td>
                    <td className="num">{fmtFull(a.engagementsGained)}</td>
                    <td className="num">{a.videosPublished}</td>
                    <td className="num">{a.avdSec == null ? "—" : duration(Math.round(a.avdSec))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card trending section" aria-label={t("Top videos")}>
            <div className="card-head">
              <div>
                <h2 className="card-title">{t("Top videos of the month")}</h2>
                <p className="card-sub">{t("Most views gained")}</p>
              </div>
            </div>
            {data.topVideos.length === 0 && <div className="empty">{t("No video activity in this period yet.")}</div>}
            <ol className="trend-list">
              {data.topVideos.map((v, i) => (
                <li key={v.id}>
                  <a href={v.url ?? "#"} target="_blank" rel="noreferrer noopener">
                    <span className="rank">{i + 1}</span>
                    <Img className="tthumb" src={v.thumbnailUrl} />
                    <span className="tinfo">
                      <span className="ttitle">{v.title}</span>
                      <span className="tmeta">
                        <i className={`dot ${v.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                        {v.accountTitle} · {date(v.publishedAt)}
                      </span>
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

          <p className="muted report-foot">
            {t("Source: YouTube Data API and YouTube Analytics. Generated {time}.", { time: new Date(data.generatedAt).toLocaleString(tag) })}
          </p>
        </>
      )}
      {!data && !error && <div className="empty">{t("Loading…")}</div>}
    </>
  );
}
