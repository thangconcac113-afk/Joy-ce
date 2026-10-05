import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseFilters, withUser } from "@/lib/api";
import { getDashboard } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withUser(async () => NextResponse.json(await getDashboard(await getDb(), parseFilters(new URL(req.url)))));
}
