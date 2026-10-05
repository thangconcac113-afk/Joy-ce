"use client";

import { useEffect, useState } from "react";
import type { PlatformFilter, RangeKey } from "@/lib/metrics";
import { useI18n } from "./I18n";

export interface FilterState {
  range: RangeKey;
  platform: PlatformFilter;
  account: number | null;
}

interface AccountOption {
  id: number;
  platform: "youtube" | "tiktok";
  title: string;
}

const RANGE_LABEL: Record<RangeKey, string> = { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };

export function useAccountOptions() {
  const [options, setOptions] = useState<AccountOption[]>([]);
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((b) => setOptions(b.accounts ?? []))
      .catch(() => setOptions([]));
  }, []);
  return options;
}

export function Filters({ value, onChange, showRange = true }: { value: FilterState; onChange: (v: FilterState) => void; showRange?: boolean }) {
  const options = useAccountOptions();
  const { t } = useI18n();
  const visible = options.filter((o) => value.platform === "all" || o.platform === value.platform);
  return (
    <div className="filters" role="group" aria-label="Filters">
      {showRange && (
        <select className="select" aria-label="Date range" value={value.range} onChange={(e) => onChange({ ...value, range: e.target.value as RangeKey })}>
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((r) => (
            <option key={r} value={r}>
              {t(RANGE_LABEL[r])}
            </option>
          ))}
        </select>
      )}
      <div className="seg" aria-label="Platform">
        {(["all", "youtube", "tiktok"] as PlatformFilter[]).map((p) => (
          <button key={p} type="button" aria-pressed={value.platform === p} onClick={() => onChange({ ...value, platform: p, account: null })}>
            {p !== "all" && <span className={`dot ${p === "youtube" ? "dot-yt" : "dot-tt"}`} aria-hidden />}
            {p === "all" ? t("All platforms") : p === "youtube" ? "YouTube" : "TikTok"}
          </button>
        ))}
      </div>
      <select
        className="select"
        aria-label="Channel"
        value={value.account ?? ""}
        onChange={(e) => onChange({ ...value, account: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">{t("All channels")}</option>
        {visible.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title} ({o.platform === "youtube" ? "YouTube" : "TikTok"})
          </option>
        ))}
      </select>
    </div>
  );
}

export function toQuery(f: FilterState, extra: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({ range: f.range, platform: f.platform });
  if (f.account) qs.set("account", String(f.account));
  for (const [k, v] of Object.entries(extra)) qs.set(k, String(v));
  return qs.toString();
}
