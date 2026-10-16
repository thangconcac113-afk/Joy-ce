import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { videos } from "@/db/schema";
import { jsonError, withUser, withManager } from "@/lib/api";
import { CONTENT_TYPES } from "@/lib/insights";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(_: Request, context: Context) {
  return withUser(async () => {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("Invalid video.", 400);
    const db = await getDb();
    const result = await db.execute(sql`select v.*, a.title as account_title, va.avd_sec, va.avg_view_pct, va.fetched_at as analytics_at from videos v join accounts a on a.id = v.account_id left join video_analytics va on va.video_id = v.id where v.id = ${id}`);
    const video = (result as unknown as {rows: Record<string,unknown>[]}).rows[0];
    if (!video) return jsonError("Video not found.", 404);
    const history = await db.execute(sql`select min(taken_at) as t, max(views)::float8 as views, max(likes)::float8 as likes, max(comments)::float8 as comments, max(shares)::float8 as shares from video_snapshots where video_id = ${id} group by date_trunc('hour', taken_at) order by t`);
    return NextResponse.json({ video, history: (history as unknown as {rows:unknown[]}).rows });
  });
}
const text = (max: number) => z.string().trim().max(max).nullable();
const schema = z.object({ contentType: z.enum(CONTENT_TYPES).nullable(), game: text(80), campaign: text(80), editor: text(80), notes: text(3000) });
export function PATCH(req: Request, context: Context) {
  return withManager(async () => {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("Invalid video.", 400);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Check your tags and notes (maximum 3,000 characters).", 400);
    const changed = await (await getDb()).update(videos).set(parsed.data).where(eq(videos.id,id)).returning({id:videos.id});
    return changed.length ? NextResponse.json({saved:true}) : jsonError("Video not found.",404);
  });
}
