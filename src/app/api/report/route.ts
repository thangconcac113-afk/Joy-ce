import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { jsonError, withUser } from "@/lib/api";
import { currentMonth, getMonthlyReport } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withUser(async () => {
    const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
    const report = await getMonthlyReport(await getDb(), month);
    return report ? NextResponse.json(report) : jsonError("Month must look like 2026-10.", 400);
  });
}
