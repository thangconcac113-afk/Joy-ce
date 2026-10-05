import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { getDb } from "@/db/client";
import { accounts, oauthStates } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { analyticsConfig, exchangeCode, myChannelId } from "@/lib/ytAnalytics";

export const dynamic = "force-dynamic";

function back(req: Request, params: Record<string, string>) {
  const url = new URL("/channels", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: "yt_oauth_state", path: "/api/youtube" });
  return res;
}

export async function GET(req: Request) {
  if (!(await currentUser())) return NextResponse.redirect(new URL("/signin", req.url));
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back(req, { error: "YouTube Analytics authorisation was cancelled." });

  const cookieState = (await cookies()).get("yt_oauth_state")?.value;
  const db = await getDb();
  const [stored] = await db
    .delete(oauthStates)
    .where(and(eq(oauthStates.state, state), gt(oauthStates.createdAt, new Date(Date.now() - 15 * 60 * 1000))))
    .returning();
  if (!code || !state || !stored || cookieState !== state) return back(req, { error: "Sign-in expired or was invalid. Try connecting again." });

  const cfg = analyticsConfig(url.origin);
  if (!cfg) return back(req, { error: "Google OAuth client is not configured." });
  try {
    const t = await exchangeCode(cfg, code);
    if (!t.refresh_token) return back(req, { error: "Google did not return a long-lived token. Try connecting again." });
    const channelId = await myChannelId(t.access_token);
    const [row] = await db
      .update(accounts)
      .set({ refreshTokenEnc: encrypt(t.refresh_token), analyticsError: null })
      .where(and(eq(accounts.platform, "youtube"), eq(accounts.externalId, channelId)))
      .returning({ title: accounts.title });
    if (!row) return back(req, { error: "That channel is not tracked yet. Add it in Channels first, then connect again." });
    return back(req, { analytics: row.title });
  } catch (e) {
    console.error(e);
    return back(req, { error: e instanceof Error ? e.message : "Could not connect YouTube Analytics." });
  }
}
