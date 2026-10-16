import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { monthlyGoals } from "@/db/schema";
import { jsonError, withUser, withManager } from "@/lib/api";
import { currentUser, canManageEmail } from "@/auth";
const schema = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), views: z.number().int().min(0).max(1e12), followers: z.number().int().min(0).max(1e10), publications: z.number().int().min(0).max(100000) });
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return withUser(async () => {
    const month = new URL(req.url).searchParams.get("month") ?? "";
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("Invalid month.", 400);
    const [goals] = await (await getDb()).select().from(monthlyGoals).where(eq(monthlyGoals.month, month));
    return NextResponse.json({ goals: goals ?? { month, views: 0, followers: 0, publications: 0 }, canManage: canManageEmail((await currentUser())!.email) });
  });
}
export function PUT(req: Request) {
  return withManager(async () => {
    const data = schema.safeParse(await req.json().catch(() => null));
    if (!data.success) return jsonError("Use non-negative whole numbers for monthly targets.", 400);
    await (await getDb()).insert(monthlyGoals).values(data.data).onConflictDoUpdate({ target: monthlyGoals.month, set: data.data });
    return NextResponse.json({ saved: true });
  });
}
