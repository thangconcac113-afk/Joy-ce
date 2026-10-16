import { getDb } from "@/db/client";
import { jsonError, withUser } from "@/lib/api";
import { currentMonth, getMonthlyReport, monthRange } from "@/lib/metrics";
import { createMonthlyPdf } from "@/lib/monthlyPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: Request) {
  return withUser(async () => {
    const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
    if (month < "2026-01" || !monthRange(month)) return jsonError("Choose a reporting month from January 2026 through the current month.", 400);
    const report = await getMonthlyReport(await getDb(), month, new Date(), { growth: true });
    if (!report) return jsonError("Invalid report month.", 400);
    const pdf = await createMonthlyPdf(report);
    return new Response(new Uint8Array(pdf), { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="ts-video-tracker-${month}.pdf"`,
      "cache-control": "private, no-store",
    } });
  });
}
