import sharp from "sharp";
import type { VideoRow } from "./metrics";

export function allowedThumbnailUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
    return ["ytimg.com", "ggpht.com", "googleusercontent.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokcdn-in.com", "byteoversea.com", "ibytedtos.com", "byteimg.com", "muscdn.com"].some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}

const CIRCLE = Buffer.from('<svg width="96" height="96"><circle cx="48" cy="48" r="48"/></svg>');

/** Bounded trusted-CDN images only. A failed preview must never prevent the report. */
export async function loadPdfThumbnails(report: { accounts: { id?: number; avatarUrl?: string | null; topVideos: Pick<VideoRow, "id" | "thumbnailUrl">[] }[] }, fetchFn: typeof fetch = fetch): Promise<Record<string, string>> {
  const videos = [...new Map(report.accounts.flatMap(a => a.topVideos).map(v => [v.id, v])).values()].slice(0, 60);
  const jobs: { key: string; url: string | null | undefined; avatar: boolean }[] = [
    ...report.accounts.filter(a => a.id != null).map(a => ({ key: `avatar${a.id}`, url: a.avatarUrl, avatar: true })),
    ...videos.map(v => ({ key: `video${v.id}`, url: v.thumbnailUrl, avatar: false })),
  ];
  const images: Record<string, string> = {};
  const maxBytes = 1_500_000;
  for (let offset = 0; offset < jobs.length; offset += 6) {
    await Promise.all(jobs.slice(offset, offset+6).map(async j => {
      if (!j.url || !allowedThumbnailUrl(j.url)) return;
      try {
        const response = await fetchFn(j.url, { redirect: "error", signal: AbortSignal.timeout(3000), cache: "no-store" });
        if (!response.ok || !/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get("content-type") ?? "")) return;
        if (Number(response.headers.get("content-length")) > maxBytes) return;
        const reader = response.body?.getReader();
        if (!reader) return;
        const chunks: Uint8Array[] = []; let total = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            total += value.length;
            if (total > maxBytes) { await reader.cancel(); return; }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const source = sharp(Buffer.concat(chunks), { limitInputPixels: 20_000_000 }).rotate();
        if (j.avatar) {
          const png = await source.resize(96,96,{fit:"cover"}).composite([{ input: CIRCLE, blend: "dest-in" }]).png().toBuffer();
          images[j.key] = `data:image/png;base64,${png.toString("base64")}`;
        } else {
          const jpeg = await source.resize(176,99,{fit:"cover"}).jpeg({quality:78}).toBuffer();
          images[j.key] = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
        }
      } catch { /* Expired CDN links, timeouts and invalid images use the PDF placeholder. */ }
    }));
  }
  return images;
}
