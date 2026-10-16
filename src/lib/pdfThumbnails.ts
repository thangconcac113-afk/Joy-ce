import sharp from "sharp";
import type { VideoRow } from "./metrics";

export function allowedThumbnailUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
    return ["ytimg.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokcdn-in.com", "byteoversea.com", "ibytedtos.com", "byteimg.com", "muscdn.com"].some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}

/** Bounded trusted-CDN images only. A failed preview must never prevent the report. */
export async function loadPdfThumbnails(report: { accounts: { topVideos: Pick<VideoRow, "id" | "thumbnailUrl">[] }[] }, fetchFn: typeof fetch = fetch): Promise<Record<string, string>> {
  const videos = [...new Map(report.accounts.flatMap(a => a.topVideos).map(v => [v.id, v])).values()].slice(0, 60);
  const images: Record<string, string> = {};
  const maxBytes = 1_500_000;
  for (let offset = 0; offset < videos.length; offset += 6) {
    await Promise.all(videos.slice(offset, offset+6).map(async v => {
      if (!v.thumbnailUrl || !allowedThumbnailUrl(v.thumbnailUrl)) return;
      try {
        const response = await fetchFn(v.thumbnailUrl, { redirect: "error", signal: AbortSignal.timeout(3000), cache: "no-store" });
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
        const image = await sharp(Buffer.concat(chunks), { limitInputPixels: 20_000_000 }).rotate().resize(160,90,{fit:"cover"}).jpeg({quality:75}).toBuffer();
        images[`video${v.id}`] = `data:image/jpeg;base64,${image.toString("base64")}`;
      } catch { /* Expired CDN links, timeouts and invalid images use the PDF placeholder. */ }
    }));
  }
  return images;
}
