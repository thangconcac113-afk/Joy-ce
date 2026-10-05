// Fills the local embedded database with clearly-labelled fake data so the UI can be
// previewed without API keys. Refuses to touch a real Postgres database.
import { getDb } from "../src/db/client";
import { accounts, accountSnapshots, pollRuns, videos, videoSnapshots } from "../src/db/schema";

if (process.env.DATABASE_URL) {
  console.error("Refusing to seed demo data into DATABASE_URL. Unset it to use the local embedded database.");
  process.exit(1);
}

const db = await getDb();
await db.delete(accounts);
await db.delete(pollRuns);

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const thumb = (title: string, color: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="16" y="160" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff">${title.slice(0, 24).replace(/[<&>]/g, "")}</text></svg>`,
  );

const DEMO = [
  { platform: "youtube" as const, title: "Team Secret (demo)", handle: "@teamsecret", followers: 412_000, color: "#2a78d6" },
  { platform: "youtube" as const, title: "Team Secret LOL (demo)", handle: "@teamsecretlol", followers: 38_500, color: "#2a78d6" },
  { platform: "youtube" as const, title: "Team Secret AOV (demo)", handle: "@teamsecretaov", followers: 96_200, color: "#2a78d6" },
  { platform: "tiktok" as const, title: "teamsecret (demo)", handle: null, followers: 268_000, color: "#eb6834" },
  { platform: "tiktok" as const, title: "teamsecret.vn (demo)", handle: null, followers: 54_300, color: "#eb6834" },
];
const TITLES = [
  "New game mode unlock?", "JUST DEFUSE THE SPIKE BRO", "Bro thought he was hiding", "how is ur ranked?", "POV: combat photographer",
  "VCT Pacific Stage 2 Finals highlights", "We should have won this one", "Mic check: TS vs ONG", "Road to Worlds 2026 trailer",
  "Player cam: clutch 1v3", "Behind the scenes: jersey shoot", "Scrim day vlog", "Top 5 plays of the week", "Fan meet recap",
];

const now = Date.now();
const HOUR = 3600_000;
const times: number[] = [];
for (let t = now - 30 * 24 * HOUR; t <= now; t += t < now - 7 * 24 * HOUR ? 6 * HOUR : HOUR) times.push(Math.floor(t / HOUR) * HOUR);

for (const [ai, d] of DEMO.entries()) {
  const [acct] = await db
    .insert(accounts)
    .values({ platform: d.platform, externalId: `demo-${ai}`, title: d.title, handle: d.handle, lastPolledAt: new Date(now - 4 * 60_000) })
    .returning();
  const vids = [];
  for (let i = 0; i < 12; i++) {
    const ageH = Math.floor(rand() * 40 * 24);
    const title = TITLES[(ai * 5 + i) % TITLES.length];
    const [v] = await db
      .insert(videos)
      .values({
        accountId: acct.id,
        platform: d.platform,
        externalId: `demo-${ai}-${i}`,
        title,
        url: null,
        thumbnailUrl: thumb(title, d.color),
        publishedAt: new Date(now - ageH * HOUR),
        durationSec: d.platform === "tiktok" ? 8 + Math.floor(rand() * 50) : 30 + Math.floor(rand() * 1500),
      })
      .returning();
    vids.push({ v, publishedAt: now - ageH * HOUR, potential: d.followers * (0.02 + rand() * 0.25) });
  }
  const acctRows = [];
  const snapRows = [];
  let followers = d.followers * 0.97;
  let prevT = times[0];
  for (const t of times) {
    const stepH = Math.max(1, (t - prevT) / HOUR);
    prevT = t;
    const hourOfDay = new Date(t).getUTCHours();
    const diurnal = 0.4 + 0.6 * Math.max(0, Math.sin(((hourOfDay - 2) / 24) * Math.PI * 2));
    followers += (d.followers * 0.00004 + rand() * d.followers * 0.00003) * diurnal * stepH;
    acctRows.push({ accountId: acct.id, takenAt: new Date(t), followers: Math.round(followers), videoCount: vids.length });
    for (const { v, publishedAt, potential } of vids) {
      if (t < publishedAt) continue;
      const age = (t - publishedAt) / HOUR;
      const views = Math.round(potential * (1 - Math.exp(-age / 36)) * (0.97 + rand() * 0.03));
      snapRows.push({ videoId: v.id, takenAt: new Date(t), views, likes: Math.round(views * 0.06), comments: Math.round(views * 0.004), shares: d.platform === "tiktok" ? Math.round(views * 0.01) : null });
    }
  }
  for (let i = 0; i < acctRows.length; i += 500) await db.insert(accountSnapshots).values(acctRows.slice(i, i + 500));
  for (let i = 0; i < snapRows.length; i += 1000) await db.insert(videoSnapshots).values(snapRows.slice(i, i + 1000));
  console.log(`${d.title}: ${vids.length} videos, ${snapRows.length} snapshots`);
}
await db.insert(pollRuns).values({ startedAt: new Date(now - 5 * 60_000), finishedAt: new Date(now - 4 * 60_000), accountsOk: DEMO.length, accountsFailed: 0, videosUpdated: 60 });
console.log("Demo data ready. Run: AUTH_DISABLED=true npm run dev");
process.exit(0);
