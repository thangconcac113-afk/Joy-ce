import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { oauthStates } from "@/db/schema";
import { jsonError, withUser } from "@/lib/api";
import { buildAuthUrl, tiktokConfig } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export function GET() {
  return withUser(async () => {
    const cfg = tiktokConfig();
    if (!cfg) return jsonError("TikTok app credentials are not configured on the server.", 503);
    const state = randomBytes(24).toString("hex");
    const db = await getDb();
    await db.insert(oauthStates).values({ state });
    const res = NextResponse.redirect(buildAuthUrl(cfg, state));
    // Binds the flow to this browser as well as to the server-side record.
    res.cookies.set("tt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/tiktok", maxAge: 900 });
    return res;
  });
}
