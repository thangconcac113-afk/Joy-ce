"use client";

import { useCallback, useEffect, useState } from "react";
import type { FilterState } from "./Filters";

const RANGES = ["24h", "7d", "30d", "90d"];
const PLATFORMS = ["all", "youtube", "tiktok"];

function valid(v: unknown): v is FilterState {
  const f = v as Partial<FilterState> | null;
  return !!f && RANGES.includes(String(f.range)) && PLATFORMS.includes(String(f.platform)) && (f.account === null || Number.isInteger(f.account));
}

/**
 * Filters that survive a reload and travel in the URL:
 * the link from the address bar opens the same view for a teammate, and without a link the
 * browser remembers the last view, so nobody has to re-pick channel and period every visit.
 */
export function useFilterState(storeKey: string, initial: FilterState) {
  const [f, setF] = useState<FilterState>(initial);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.has("range") || q.has("platform") || q.has("account")) {
        const a = Number(q.get("account"));
        const fromUrl = { range: q.get("range") ?? initial.range, platform: q.get("platform") ?? initial.platform, account: Number.isInteger(a) && a > 0 ? a : null };
        if (valid(fromUrl)) return setF(fromUrl);
      }
      const saved = JSON.parse(window.localStorage.getItem(storeKey) ?? "null");
      if (valid(saved)) setF(saved);
    } catch {
      /* storage can be blocked; the page still works with defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  const set = useCallback(
    (next: FilterState) => {
      setF(next);
      try {
        window.localStorage.setItem(storeKey, JSON.stringify(next));
        const q = new URLSearchParams({ range: next.range, platform: next.platform });
        if (next.account) q.set("account", String(next.account));
        window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
      } catch {
        /* ignore */
      }
    },
    [storeKey],
  );
  return [f, set] as const;
}
