"use client";
import { LoadingState } from "./LoadingState";

import { useState, useEffect } from "react";
import type { MonthlyReport } from "@/lib/metrics";
import { currentMonth } from "@/lib/metrics";
import { Img } from "./Img";
import { Kpi } from "./Kpi";
import { useLive } from "./useLive";
import { useI18n } from "./I18n";
import { duration, fmt, fmtFull, PLATFORM_LABEL, pctChange, signed } from "./format";

/** Every tracked month since January 2026, newest first, in Vietnam time. */
function recentMonths(now = new Date()) {
  const latest = currentMonth(now);
  const count = (Number(latest.slice(0, 4)) - 2026) * 12 + Number(latest.slice(5, 7));
  return Array.from({ length: Math.max(0, count) }, (_, i) => new Date(Date.UTC(2026, i, 1)).toISOString().slice(0, 7)).reverse();
}

export function Report() {
  const { t, tag, date } = useI18n();
  const months = recentMonths();
  const [month, setMonth] = useState(months[0]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  async function downloadPdf() {
    setPdfBusy(true); setPdfError("");
    try {
      const response = await fetch(`/api/report/pdf?month=${month}`);
      if (!response.ok) throw new Error("Could not generate the PDF. Please try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `ts-video-tracker-${month}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setPdfError(error instanceof Error ? error.message : "PDF export failed."); }
    finally { setPdfBusy(false); }
  }
  useEffect(() => { const m = new URLSearchParams(window.location.search).get("month"); if (m && months.includes(m)) setMonth(m); }, []);
  const { data, error } = useLive<MonthlyReport>(`/api/report?month=${month}`, 120_000);
  const label = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(tag, { month: "long", year: "numeric" });

  const k = data?.kpis;
  const pct = k && data?.comparisonReady ? pctChange(k.viewsGained, k.viewsGainedPrev) : null;
  const top = data?.topVideos[0];
  const partial = data?.trackingSince && new Date(data.trackingSince) > new Date(`${month}-02T00:00:00`);

  const summary =
    data && k
      ? [
          t("In {month}, Team Secret channels gained {views} views ({change}), {followers} net new followers and {engagements} engagements, with {videos} videos published.", {
            month: label(month),
            views: fmtFull(k.viewsGained),
            change: pct === null ? t("no previous month to compare") : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% ${t(data?.complete ? "vs previous month" : "vs same elapsed time last month")}`,
            followers: signed(k.followersGained),
            engagements: fmtFull(k.engagements),
            videos: k.videosPublished,
          }),
          top ? t("Top video: “{title}” ({channel}) with {n} views gained.", { title: top.title, channel: top.accountTitle, n: fmtFull(top.viewsGained) }) : "",
          data.avdSec != null ? t("Average view duration for this month is {avd}.", { avd: duration(Math.round(data.avdSec)) ?? "" }) : "",
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
        <div className="head-actions report-actions no-print">
          <label className="filter-field"><span className="control-label">{t("Reporting month")}</span><select className="select" aria-label={t("Month")} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select></label>
          <a className="btn" href={`/api/report/export?month=${month}`}>
            {t("Export CSV")}
          </a>
          <button className="btn btn-primary" type="button" disabled={!data || pdfBusy} onClick={downloadPdf}>
            {pdfBusy ? "Generating PDF..." : "Download monthly PDF"}
          </button>
          <button className="btn" type="button" onClick={() => window.print()}>
            {t("Print / Save PDF")}
          </button>
        </div>
      </div>

      <p className="export-guide no-print"><b>Export guide</b><span>PDF includes every channel, growth charts and video thumbnails. CSV is for spreadsheets. Print saves the current view.</span></p>
      {pdfError && <div className="banner" role="alert">{pdfError}</div>}
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
          <p className="muted">{date(data.period.start)} to {date(data.period.end)} · Comparison: {date(data.period.previousStart)} to {date(data.period.previousEnd)}{!data.comparisonReady && " · Insufficient tracking history for growth comparisons"}</p>
          <section className="card report-summary" aria-label={t("Summary")}>
            <p>{summary}</p>
          </section>

          <div className="kpis">
            <Kpi noDelta={!data.comparisonReady} label={t("Views gained")} value={k.viewsGained} current={k.viewsGained} previous={k.viewsGainedPrev} period="" compareLabel={t(data?.complete ? "vs previous month" : "vs same elapsed time last month")} />
            <Kpi noDelta={!data.comparisonReady} label={t("Engagements")} value={k.engagements} current={k.engagements} previous={k.engagementsPrev} period="" compareLabel={t(data?.complete ? "vs previous month" : "vs same elapsed time last month")} />
            <Kpi noDelta={!data.comparisonReady} label={t("Net followers")} value={k.followersGained} valueText={signed(k.followersGained)} current={k.followersGained} previous={k.followersGainedPrev} period="" compareLabel={t(data?.complete ? "vs previous month" : "vs same elapsed time last month")} note={t("{n} total followers", { n: fmt(k.followers) })} />
            <Kpi
              label={t("Videos published")}
              value={k.videosPublished}
              current={k.videosPublished}
              previous={k.videosPublishedPrev}
              period=""
              compareLabel={t(data?.complete ? "vs previous month" : "vs same elapsed time last month")}
              noDelta={!data.comparisonReady}
              note={data.complete ? undefined : t("Month in progress: {n} days counted so far", { n: new Date().getDate() })}
            />
            <Kpi
              label={t("Avg view duration")}
              value={data.avdSec ?? 0}
              valueText={data.avdSec == null ? "—" : (duration(Math.round(data.avdSec)) ?? "—")}
              noDelta
              note={data.avdSec == null ? t("Monthly watch duration is not available yet") : t("Selected calendar month")}
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
            {t("Source: YouTube Data API, YouTube Analytics and TikTok Display API. Generated {time}.", { time: new Date(data.generatedAt).toLocaleString(tag) })}
          </p>
        </>
      )}
      {!data && !error && <LoadingState />}
    </>
  );
}
