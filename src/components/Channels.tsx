"use client";

import { useState } from "react";
import { Img } from "./Img";
import { useLive } from "./useLive";
import { PLATFORM_LABEL } from "./format";
import { useI18n } from "./I18n";

interface AccountsResponse {
  accounts: {
    id: number;
    platform: "youtube" | "tiktok";
    title: string;
    handle: string | null;
    avatarUrl: string | null;
    lastPolledAt: string | null;
    lastError: string | null;
    refreshTokenExpiresAt: string | null;
    analyticsConnected: boolean;
    analyticsError: string | null;
  }[];
  config: { youtube: boolean; tiktok: boolean; analytics: boolean };
}

export function Channels({ connected, connectError, analytics }: { connected?: string; connectError?: string; analytics?: string }) {
  const { t, ago } = useI18n();
  const { data, error, reload } = useLive<AccountsResponse>("/api/accounts", 60_000);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: true, text: t("Added {title}. Its numbers appear after the next sync.", { title: body.title }) } : { ok: false, text: body.error ?? t("Could not add channel.") });
      if (res.ok) setInput("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, title: string) {
    if (!window.confirm(t("Stop tracking {title}? Its history will be deleted.", { title }))) return;
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Channels")}</h1>
          <p>{t("Choose which Team Secret YouTube channels and TikTok accounts are tracked.")}</p>
        </div>
      </div>
      {connected && <div className="banner ok">{t("Connected TikTok account {name}.", { name: connected })}</div>}
      {analytics && <div className="banner ok">{t("YouTube Analytics connected for {name}. AVD appears after the next sync.", { name: analytics })}</div>}
      {connectError && (
        <div className="banner" role="alert">
          {connectError}
        </div>
      )}
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}

      <div className="connect">
        <section className="card" aria-label="Add YouTube channel">
          <h2 className="card-title">
            <i className="dot dot-yt" aria-hidden /> {t("Add a YouTube channel")}
          </h2>
          <p className="card-sub">{t("Public channel stats via the YouTube Data API. Paste a @handle, channel ID or channel URL.")}</p>
          {data && !data.config.youtube && <span className="err">{t("YOUTUBE_API_KEY is not configured on the server.")}</span>}
          <form onSubmit={add}>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="@TeamSecret or youtube.com/@..." aria-label="YouTube channel" required />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>
              {busy ? t("Adding…") : t("Add channel")}
            </button>
          </form>
          {msg && <span className={msg.ok ? "status-ok" : "err"}>{msg.text}</span>}
        </section>
        <section className="card" aria-label="Connect TikTok account">
          <h2 className="card-title">
            <i className="dot dot-tt" aria-hidden /> {t("Connect a TikTok account")}
          </h2>
          <p className="card-sub">
            {t("Whoever manages the TikTok account signs in once and approves read-only access to profile stats and videos. Access renews automatically for a year.")}
          </p>
          {data && !data.config.tiktok && <span className="err">{t("TikTok app credentials are not configured on the server.")}</span>}
          <div>
            {data?.config.tiktok ? (
              <a className="btn btn-primary" href="/api/tiktok/connect">
                {t("Connect with TikTok")}
              </a>
            ) : (
              <button className="btn btn-primary" type="button" disabled>
                {t("Connect with TikTok")}
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="card section" aria-label="Tracked channels">
        <div className="section-head">
          <h2 className="card-title">{t("Tracked channels")}</h2>
          <span className="card-sub">{t("{n} channels", { n: data?.accounts.length ?? 0 })}</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("Channel")}</th>
                <th>{t("Platform")}</th>
                <th>{t("Status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.accounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    {t("Nothing tracked yet.")}
                  </td>
                </tr>
              )}
              {data?.accounts.map((a) => {
                const expiring = a.refreshTokenExpiresAt && new Date(a.refreshTokenExpiresAt).getTime() - Date.now() < 14 * 86400_000;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="who">
                        <Img className="avatar" src={a.avatarUrl} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.title}</div>
                          {a.handle && <div className="muted">{a.handle}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="platform-tag">
                        <i className={`dot ${a.platform === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />
                        {PLATFORM_LABEL[a.platform]}
                      </span>
                    </td>
                    <td>
                      {a.lastError ? (
                        <span className="err">⚠ {a.lastError}</span>
                      ) : a.lastPolledAt ? (
                        <span className="status-ok">{t("✓ Synced {time}", { time: ago(a.lastPolledAt) })}</span>
                      ) : (
                        <span className="muted">{t("Waiting for first sync")}</span>
                      )}
                      {a.platform === "youtube" && a.analyticsConnected && !a.analyticsError && <div className="status-ok">{t("✓ YouTube Analytics connected")}</div>}
                      {a.platform === "youtube" && a.analyticsError && <div className="err">⚠ {a.analyticsError}</div>}
                      {a.platform === "tiktok" && expiring && <div className="err">{t("Authorisation expires soon. Reconnect this account.")}</div>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {a.platform === "youtube" && data.config.analytics && (
                        <a className="btn" href="/api/youtube/connect" style={{ marginRight: 8 }}>
                          {a.analyticsConnected ? t("Reconnect Analytics") : t("Connect Analytics")}
                        </a>
                      )}
                      {a.platform === "youtube" && data.config.analytics && !a.analyticsConnected && (
                        <a className="btn" href="/api/youtube/connect?any=1" style={{ marginRight: 8 }} title={t("For a channel manager who signs in with a non-company Google account (e.g. Gmail)")}>
                          {t("Connect with another Google account")}
                        </a>
                      )}
                      <button className="btn btn-danger" type="button" onClick={() => remove(a.id, a.title)}>
                        {t("Remove")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
