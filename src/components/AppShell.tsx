"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Nav } from "./Nav";
import { Img } from "./Img";
import { LangSwitch } from "./I18n";

export function AppShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("tsvt.sidebar") === "compact"); } catch { /* optional preference */ }
    let active = true;
    fetch("/api/accounts").then(r => r.ok ? r.json() : null).then(body => {
      const main = body?.accounts?.find((a: { platform: string; handle: string | null }) => a.platform === "youtube" && a.handle?.replace(/^@/, "").toLowerCase() === "teamsecret");
      if (active) setLogo(main?.avatarUrl ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  function toggle() {
    setCollapsed(!collapsed);
    try { localStorage.setItem("tsvt.sidebar", collapsed ? "expanded" : "compact"); } catch { /* optional preference */ }
  }
  return <div className={`shell ${collapsed ? "shell-compact" : ""}`}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Team Secret Video Tracker">
        {logo ? <Img className="brand-logo" src={logo} /> : <span className="brand-mark" aria-hidden>TS</span>}
        <span className="brand-copy"><small>TEAM SECRET</small><b>Video Tracker</b></span>
      </a>
      <button className="sidebar-toggle" type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "›" : "‹"}</button>
      <Nav className="nav" />
      <div className="sidebar-foot">{footer}</div>
    </aside>
    <div><LangSwitch className="lang-mobile" /><Nav className="mobile-nav" /><main className="main">{children}</main></div>
  </div>;
}
