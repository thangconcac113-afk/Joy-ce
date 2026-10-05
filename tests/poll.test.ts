import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openPglite, type Db } from "@/db/client";
import { accounts } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getDashboard, getLibrary } from "@/lib/metrics";
import { pollAll } from "@/lib/poll";

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake YouTube + TikTok backend whose counters we can move between polls. */
function fakeApis(state: { ytViews: number; ttViews: number; subs: number; ttFollowers: number; refreshed: number }) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "www.googleapis.com") {
      if (url.pathname.endsWith("/channels"))
        return json({
          items: [
            {
              id: "UCmain0000000000000000aa",
              snippet: { title: "Team Secret", customUrl: "@teamsecret" },
              statistics: { subscriberCount: String(state.subs), viewCount: "1000000", videoCount: "2" },
              contentDetails: { relatedPlaylists: { uploads: "UUmain" } },
            },
          ],
        });
      if (url.pathname.endsWith("/playlistItems")) return json({ items: [{ contentDetails: { videoId: "v1" } }, { contentDetails: { videoId: "v2" } }] });
      if (url.pathname.endsWith("/videos"))
        return json({
          items: [
            { id: "v1", snippet: { title: "Old video", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: String(state.ytViews), likeCount: "10" }, contentDetails: { duration: "PT1M" } },
            { id: "v2", snippet: { title: "Second", publishedAt: "2026-01-02T00:00:00Z" }, statistics: { viewCount: "500" }, contentDetails: { duration: "PT10S" } },
          ],
        });
    }
    if (url.hostname === "open.tiktokapis.com") {
      if (url.pathname === "/v2/oauth/token/") {
        state.refreshed++;
        return json({ access_token: "new-at", refresh_token: "new-rt", open_id: "tt1", expires_in: 86400, refresh_expires_in: 31536000 });
      }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer new-at");
      if (url.pathname === "/v2/user/info/")
        return json({ data: { user: { open_id: "tt1", display_name: "Team Secret TikTok", follower_count: state.ttFollowers, likes_count: 5, video_count: 1 } }, error: { code: "ok" } });
      if (url.pathname === "/v2/video/list/")
        return json({ data: { videos: [{ id: "t1", title: "Clutch", create_time: 1767225600, view_count: state.ttViews, like_count: 3 }], has_more: false, cursor: 0 }, error: { code: "ok" } });
    }
    return json({ error: { message: "unexpected " + url } }, 404);
  }) as typeof fetch;
}

describe("poll + dashboard", () => {
  let db: Db;
  const state = { ytViews: 1000, ttViews: 200, subs: 50000, ttFollowers: 900, refreshed: 0 };
  const t0 = new Date("2026-10-05T10:00:00Z");
  const t1 = new Date("2026-10-05T11:00:00Z");

  beforeAll(async () => {
    db = await openPglite("memory://");
    await db.insert(accounts).values([
      { platform: "youtube", externalId: "UCmain0000000000000000aa", title: "pending" },
      {
        platform: "tiktok",
        externalId: "tt1",
        title: "pending",
        accessTokenEnc: encrypt("old-at"),
        refreshTokenEnc: encrypt("old-rt"),
        accessTokenExpiresAt: new Date("2026-10-05T10:05:00Z"), // expires soon -> must refresh
        refreshTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    ]);
  });

  it("collects both platforms and computes gains between polls", async () => {
    const opts = { youtubeApiKey: "k", tiktok: { clientKey: "c", clientSecret: "s", redirectUri: "https://x/cb" } };
    const r0 = await pollAll(db, { ...opts, now: t0, fetchFn: fakeApis(state) });
    expect(r0).toMatchObject({ accountsOk: 2, accountsFailed: 0, videosUpdated: 3 });
    expect(state.refreshed).toBe(1);

    state.ytViews += 300;
    state.ttViews += 50;
    state.subs += 20;
    state.ttFollowers += 5;
    const r1 = await pollAll(db, { ...opts, now: t1, fetchFn: fakeApis(state) });
    expect(r1.accountsOk).toBe(2);
    expect(state.refreshed).toBe(1); // refreshed token is reused, not refreshed again

    const d = await getDashboard(db, { range: "24h", platform: "all", now: new Date("2026-10-05T11:30:00Z") });
    // Videos were first seen inside the window and published long before it, so the
    // first in-window snapshot is the baseline: gains are only what moved between polls.
    expect(d.kpis.viewsGained).toBe(350);
    expect(d.kpis.followersGained).toBe(25);
    expect(d.kpis.followers).toBe(50020 + 905);
    expect(d.topVideos[0]).toMatchObject({ title: "Old video", viewsGained: 300 });
    const hourly = d.viewsSeries.find((p) => p.t === "2026-10-05T11:00:00.000Z");
    expect(hourly).toMatchObject({ youtube: 300, tiktok: 50 });

    const yt = await getDashboard(db, { range: "24h", platform: "youtube", now: new Date("2026-10-05T11:30:00Z") });
    expect(yt.kpis.viewsGained).toBe(300);
    expect(yt.accounts.map((a) => a.title)).toEqual(["Team Secret"]);

    const lib = await getLibrary(db, { platform: "all", sort: "trending", page: 1, q: "clutch", now: new Date("2026-10-05T11:30:00Z") });
    expect(lib.total).toBe(1);
    expect(lib.items[0].viewsGained).toBe(50);
  });

  it("records a per-account error instead of failing the run", async () => {
    const broken = (async () => json({ error: { message: "quotaExceeded" } }, 403)) as typeof fetch;
    const r = await pollAll(db, { youtubeApiKey: "k", tiktok: null, now: new Date("2026-10-05T12:00:00Z"), fetchFn: broken });
    expect(r.accountsFailed).toBe(2);
    const [yt] = await db.select().from(accounts).where(eq(accounts.platform, "youtube"));
    expect(yt.lastError).toContain("quotaExceeded");
  });
});
