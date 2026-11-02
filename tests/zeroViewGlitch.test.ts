import { describe, expect, it } from "vitest";
import { openPglite } from "@/db/client";
import { accounts, accountSnapshots, videos, videoSnapshots } from "@/db/schema";
import { getDashboard } from "@/lib/metrics";
import { getMonthlyGrowth } from "@/lib/monthlyGrowth";
import { isGlitchReading } from "@/lib/snapshots";

// Nov 2026 AOV TikTok report: a 0-view reading for a weeks-old video became the baseline,
// so the whole 182,413 lifetime views showed up as "gained" in one day.
describe("TikTok 0-view glitch", () => {
  async function seed() {
    const db = await openPglite("memory://");
    const [a] = await db.insert(accounts).values({ platform: "tiktok", externalId: "aov", title: "AOV" }).returning();
    await db.insert(accountSnapshots).values({ accountId: a.id, takenAt: new Date("2026-10-15T10:00:00Z"), followers: 1000 });
    const [v] = await db.insert(videos).values({ accountId: a.id, platform: "tiktok", externalId: "v", title: "Old hit", publishedAt: new Date("2026-10-10T14:30:00Z") }).returning();
    await db.insert(videoSnapshots).values([
      { videoId: v.id, takenAt: new Date("2026-10-31T13:00:00Z"), views: 0, likes: 0 },
      { videoId: v.id, takenAt: new Date("2026-11-01T02:00:00Z"), views: 182413, likes: 7000 },
      { videoId: v.id, takenAt: new Date("2026-11-01T10:00:00Z"), views: 182500, likes: 7004 },
    ]);
    return db;
  }

  it("ignores the glitch as a baseline in dashboard totals and series", async () => {
    const db = await seed();
    const d = await getDashboard(db, { range: "24h", platform: "all", now: new Date("2026-11-01T12:00:00Z") });
    expect(d.kpis.viewsGained).toBe(87);
    expect(d.viewsSeries.reduce((n, p) => n + p.tiktok, 0)).toBe(87);
  });

  it("ignores the glitch in the PDF daily chart", async () => {
    const db = await seed();
    const pts = await getMonthlyGrowth(db, new Date("2026-10-31T17:00:00Z"), new Date("2026-11-01T17:00:00Z"));
    expect(pts.reduce((n, p) => n + p.views, 0)).toBe(87);
  });

  it("drops new glitch readings at poll time but keeps a fresh upload's real 0", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(isGlitchReading(0, "2026-10-10T14:30:00Z", now)).toBe(true);
    expect(isGlitchReading(0, "2026-11-01T11:00:00Z", now)).toBe(false);
    expect(isGlitchReading(5, "2026-10-10T14:30:00Z", now)).toBe(false);
  });
});
