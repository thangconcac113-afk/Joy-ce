import { describe, expect, it } from "vitest";
import { openPglite } from "@/db/client";
import { accounts, accountSnapshots, videos, videoSnapshots } from "@/db/schema";
import { getMonthlyReport } from "@/lib/metrics";
import { createMonthlyPdf, monthlyPdfDefinition } from "@/lib/monthlyPdf";

describe("monthly PDF", () => {
  it("keeps each channel's top videos and previous-month counts separate, including a smaller channel", async () => {
    const db = await openPglite("memory://");
    for (let channel = 0; channel < 2; channel++) {
      const [a] = await db.insert(accounts).values({ platform: channel ? "tiktok" : "youtube", externalId: `pdf-${channel}`, title: channel ? "Team Secret Liên Quân VN" : "Main channel" }).returning();
      await db.insert(accountSnapshots).values([
        { accountId: a.id, takenAt: new Date("2026-08-31T16:00:00Z"), followers: 100 },
        { accountId: a.id, takenAt: new Date("2026-09-30T16:00:00Z"), followers: 110 },
        { accountId: a.id, takenAt: new Date("2026-10-15T00:00:00Z"), followers: 120 },
      ]);
      for (let i = 0; i < 6; i++) {
        const [v] = await db.insert(videos).values({ accountId: a.id, platform: a.platform, externalId: `${channel}-${i}`, title: `Tiếng Việt ${channel}-${i} 🎬`, publishedAt: new Date(i === 0 ? "2026-09-02T00:00:00Z" : "2026-10-02T00:00:00Z") }).returning();
        await db.insert(videoSnapshots).values([
          { videoId: v.id, takenAt: new Date("2026-10-02T01:00:00Z"), views: 20, likes: 2 },
          { videoId: v.id, takenAt: new Date("2026-10-15T00:00:00Z"), views: channel ? 30 + i : 1000 + i, likes: 5 },
        ]);
      }
    }
    const report = (await getMonthlyReport(db, "2026-10", new Date("2026-10-16T00:00:00Z"), { growth: true }))!;
    expect(report.kpis.videosPublishedPrev).toBe(2);
    expect(report.accounts.map(a => a.videosPublishedPrev)).toEqual([1, 1]);
    expect(report.accounts.every(a => a.topVideos.length === 5 && a.topVideos.every(v => v.accountId === a.id))).toBe(true);
    expect(report.accounts.find(a => a.platform === "tiktok")!.topVideos[0].viewsGained).toBeLessThan(report.topVideos[4].viewsGained);
    const definition = JSON.stringify(monthlyPdfDefinition(report));
    expect(definition).toContain("Tiếng Việt");
    expect(definition).not.toContain("🎬");
    expect(definition).toContain("YouTube only");
    const pdf = await createMonthlyPdf(report);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
