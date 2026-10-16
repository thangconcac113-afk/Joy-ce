import { describe, expect, it } from "vitest";
import { openPglite } from "@/db/client";
import { accounts, accountSnapshots, videos, videoSnapshots } from "@/db/schema";
import { getDashboard, monthRange } from "@/lib/metrics";

describe("reliable growth", () => {
  it("excludes imported lifetime counters even for videos published inside the period", async () => {
    const db = await openPglite("memory://");
    const [a] = await db.insert(accounts).values({ platform: "tiktok", externalId: "import", title: "Imported" }).returning();
    await db.insert(accountSnapshots).values({ accountId: a.id, takenAt: new Date("2026-10-15T10:00:00Z"), followers: 100 });
    const [v] = await db.insert(videos).values({ accountId: a.id, platform: "tiktok", externalId: "v", title: "Existing hit", publishedAt: new Date("2026-10-15T09:00:00Z") }).returning();
    await db.insert(videoSnapshots).values([
      { videoId: v.id, takenAt: new Date("2026-10-15T10:00:00Z"), views: 100000, likes: 1000 },
      { videoId: v.id, takenAt: new Date("2026-10-15T11:00:00Z"), views: 100200, likes: 1004 },
    ]);
    const d = await getDashboard(db, { range: "24h", platform: "all", now: new Date("2026-10-15T12:00:00Z") });
    expect(d.kpis.viewsGained).toBe(200);
    expect(d.kpis.engagements).toBe(4);
    expect(d.comparisonReady).toBe(false);
    expect(d.viewsSeries.reduce((n, p) => n + p.tiktok, 0)).toBe(200);
  });
  it("compares elapsed month time and caps shorter previous months", () => {
    const r = monthRange("2026-10", new Date("2026-10-16T04:00:00Z"))!;
    expect(r.prevEnd.toISOString()).toBe("2026-09-16T04:00:00.000Z");
    const shorter = monthRange("2026-03", new Date("2026-03-31T04:00:00Z"))!;
    expect(shorter.prevEnd).toEqual(shorter.start);
    expect(monthRange("2027-01", new Date("2026-10-16"))).toBeNull();
  });
});
