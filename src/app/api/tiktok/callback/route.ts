import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { getDb } from "@/db/client";
import { accounts, oauthStates } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, fetchUser, tiktokConfig } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

function back(req: Request, params: Record<string, string>) {
  const url = new URL("/channels", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: "tt_oauth_state", path: "/api/tiktok" });
  return res;
}

export async function GET(req: Request) {
  if (!(await currentUser())) return NextResponse.redirect(new URL("/signin", req.url));
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back(req, { error: url.searchParams.get("error_description") || "TikTok authorisation was cancelled." });

  const cookieState = (await cookies()).get("tt_oauth_state")?.value;
  const db = await getDb();
  const fresh = new Date(Date.now() - 15 * 60 * 1000);
  const [stored] = await db
    .delete(oauthStates)
    .where(and(eq(oauthStates.state, state), gt(oauthStates.createdAt, fresh)))
    .returning();
  if (!code || !state || !stored || cookieState !== state) return back(req, { error: "TikTok sign-in expired or was invalid. Try connecting again." });

  const cfg = tiktokConfig();
  if (!cfg) return back(req, { error: "TikTok app credentials are not configured." });
  try {
    const t = await exchangeCode(cfg, code);
    const user = await fetchUser(t.accessToken);
    const tokens = {
      accessTokenEnc: encrypt(t.accessToken),
      refreshTokenEnc: encrypt(t.refreshToken),
      accessTokenExpiresAt: t.accessTokenExpiresAt,
      refreshTokenExpiresAt: t.refreshTokenExpiresAt,
      title: user.displayName,
      avatarUrl: user.avatarUrl,
      lastError: null,
    };
    await db
      .insert(accounts)
      .values({ platform: "tiktok", externalId: t.openId, ...tokens })
      .onConflictDoUpdate({ target: [accounts.platform, accounts.externalId], set: tokens });
    return back(req, { connected: user.displayName });
  } catch (e) {
    console.error(e);
    return back(req, { error: e instanceof Error ? e.message : "Could not connect TikTok." });
  }
}
