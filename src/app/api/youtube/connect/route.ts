import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { oauthStates } from "@/db/schema";
import { jsonError, withUser } from "@/lib/api";
import { analyticsConfig, buildAuthUrl } from "@/lib/ytAnalytics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withUser(async () => {
    const cfg = analyticsConfig(new URL(req.url).origin);
    if (!cfg) return jsonError("Google OAuth client is not configured on the server.", 503);
    if (!process.env.TOKEN_ENCRYPTION_KEY) return jsonError("TOKEN_ENCRYPTION_KEY is not configured on the server.", 503);
    const state = randomBytes(24).toString("hex");
    await (await getDb()).insert(oauthStates).values({ state });
    const res = NextResponse.redirect(buildAuthUrl(cfg, state, new URL(req.url).searchParams.get("any") === "1"));
    // Binds the flow to this browser as well as to the server-side record.
    res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/youtube", maxAge: 900 });
    return res;
  });
}
