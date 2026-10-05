import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts } from "@/db/schema";
import { jsonError, withUser } from "@/lib/api";
import { tiktokConfig } from "@/lib/tiktok";
import { resolveChannel, YouTubeError } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export function GET() {
  return withUser(async () => {
    const db = await getDb();
    const rows = await db
      .select({
        id: accounts.id,
        platform: accounts.platform,
        title: accounts.title,
        handle: accounts.handle,
        avatarUrl: accounts.avatarUrl,
        lastPolledAt: accounts.lastPolledAt,
        lastError: accounts.lastError,
        refreshTokenExpiresAt: accounts.refreshTokenExpiresAt,
        analyticsError: accounts.analyticsError,
        analyticsConnected: sql<boolean>`${accounts.platform} = 'youtube' and ${accounts.refreshTokenEnc} is not null`,
      })
      .from(accounts)
      .orderBy(asc(accounts.platform), asc(accounts.title));
    return NextResponse.json({
      accounts: rows,
      config: {
        youtube: Boolean(process.env.YOUTUBE_API_KEY),
        tiktok: Boolean(tiktokConfig()),
        analytics: Boolean(process.env.AUTH_GOOGLE_ID && process.env.TOKEN_ENCRYPTION_KEY),
      },
    });
  });
}

const addSchema = z.object({ input: z.string().min(2).max(200) });

/** Add a YouTube channel by @handle, ID or URL. TikTok accounts connect via OAuth. */
export function POST(req: Request) {
  return withUser(async () => {
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Enter a channel @handle, ID or URL.", 400);
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return jsonError("YOUTUBE_API_KEY is not configured on the server.", 503);
    try {
      const ch = await resolveChannel(parsed.data.input, key);
      const db = await getDb();
      const [row] = await db
        .insert(accounts)
        .values({
          platform: "youtube",
          externalId: ch.id,
          title: ch.title,
          handle: ch.handle,
          avatarUrl: ch.avatarUrl,
          uploadsPlaylistId: ch.uploadsPlaylistId,
        })
        .onConflictDoNothing()
        .returning({ id: accounts.id });
      if (!row) return jsonError(`${ch.title} is already tracked.`, 409);
      return NextResponse.json({ id: row.id, title: ch.title }, { status: 201 });
    } catch (e) {
      if (e instanceof YouTubeError) return jsonError(e.message, 400);
      throw e;
    }
  });
}

export function DELETE(req: Request) {
  return withUser(async () => {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return jsonError("Invalid account id.", 400);
    const db = await getDb();
    await db.delete(accounts).where(eq(accounts.id, id));
    return new NextResponse(null, { status: 204 });
  });
}
