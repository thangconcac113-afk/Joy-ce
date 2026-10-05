"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetches JSON and re-fetches every `intervalMs` while the tab is visible.
 * Keeps the previous data on screen while reloading (no flash, no layout jump).
 */
export function useLive<T>(url: string, intervalMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async () => {
    setLoading(true);
    const target = urlRef.current;
    try {
      const res = await fetch(target, { cache: "no-store" });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const body = isJson ? await res.json() : null;
      if (target !== urlRef.current) return; // a newer filter won the race
      if (res.status === 401) {
        window.location.href = "/signin";
        return;
      }
      if (!res.ok || !isJson) throw new Error(body?.error ?? `Server returned ${res.status} (${isJson ? "error" : "not JSON"}).`);
      setData(body as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [url, load]);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && load();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs, load]);

  return { data, error, loading, reload: load };
}
