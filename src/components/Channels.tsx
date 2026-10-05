"use client";

import { useState } from "react";
import { Img } from "./Img";
import { useLive } from "./useLive";
import { ago, PLATFORM_LABEL } from "./format";

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
  }[];
  config: { youtube: boolean; tiktok: boolean };
}

export function Channels({ connected, connectError }: { connected?: string; connectError?: string }) {
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
      setMsg(res.ok ? { ok: true, text: `Added ${body.title}. Its numbers appear after the next sync.` } : { ok: false, text: body.error ?? "Could not add channel." });
      if (res.ok) setInput("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, title: string) {
    if (!window.confirm(`Stop tracking ${title}? Its history will be deleted.`)) return;
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Channels</h1>
          <p>Choose which Team Secret YouTube channels and TikTok accounts are tracked.</p>
        </div>
      </div>
      {connected && <div className="banner ok">Connected TikTok account {connected}.</div>}
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
            <i className="dot dot-yt" aria-hidden /> Add a YouTube channel
          </h2>
          <p className="card-sub">Public channel stats via the YouTube Data API. Paste a @handle, channel ID or channel URL.</p>
          {data && !data.config.youtube && <span className="err">YOUTUBE_API_KEY is not configured on the server.</span>}
          <form onSubmit={add}>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="@TeamSecret or youtube.com/@..." aria-label="YouTube channel" required />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>
              {busy ? "Adding…" : "Add channel"}
            </button>
          </form>
          {msg && <span className={msg.ok ? "status-ok" : "err"}>{msg.text}</span>}
        </section>
        <section className="card" aria-label="Connect TikTok account">
          <h2 className="card-title">
            <i className="dot dot-tt" aria-hidden /> Connect a TikTok account
          </h2>
          <p className="card-sub">
            Whoever manages the TikTok account signs in once and approves read-only access to profile stats and videos. Access renews automatically for a year.
          </p>
          {data && !data.config.tiktok && <span className="err">TikTok app credentials are not configured on the server.</span>}
          <div>
            {data?.config.tiktok ? (
              <a className="btn btn-primary" href="/api/tiktok/connect">
                Connect with TikTok
              </a>
            ) : (
              <button className="btn btn-primary" type="button" disabled>
                Connect with TikTok
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="card section" aria-label="Tracked channels">
        <div className="section-head">
          <h2 className="card-title">Tracked channels</h2>
          <span className="card-sub">{data?.accounts.length ?? 0} channels</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Platform</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.accounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    Nothing tracked yet.
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
                        <span className="status-ok">✓ Synced {ago(a.lastPolledAt)}</span>
                      ) : (
                        <span className="muted">Waiting for first sync</span>
                      )}
                      {a.platform === "tiktok" && expiring && <div className="err">Authorisation expires soon. Reconnect this account.</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-danger" type="button" onClick={() => remove(a.id, a.title)}>
                        Remove
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
