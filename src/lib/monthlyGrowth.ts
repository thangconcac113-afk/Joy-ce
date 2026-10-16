import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export interface MonthlyGrowthPoint { accountId: number; day: string; views: number }

/** Attribute observed counter changes to the Vietnam day when collected, never backfill imports. */
export async function getMonthlyGrowth(db: Db, start: Date, end: Date): Promise<MonthlyGrowthPoint[]> {
  const result = await db.execute(sql`
    with samples as (
      select v.id as video_id, v.account_id, v.published_at, b.id, b.taken_at, b.views
      from videos v join lateral (
        select s.id, s.taken_at, s.views from video_snapshots s
        where s.video_id = v.id and s.taken_at <= ${start.toISOString()}::timestamptz
        order by s.taken_at desc, s.id desc limit 1
      ) b on true
      union all
      select v.id, v.account_id, v.published_at, s.id, s.taken_at, s.views
      from video_snapshots s join videos v on v.id = s.video_id
      where s.taken_at > ${start.toISOString()}::timestamptz and s.taken_at <= ${end.toISOString()}::timestamptz
    ), changes as (
      select *, lag(views) over(partition by video_id order by taken_at, id) as previous_views from samples
    )
    select account_id as "accountId", to_char(taken_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as day,
      sum(greatest(views - coalesce(previous_views,
        case when published_at >= ${start.toISOString()}::timestamptz and exists (
          select 1 from account_snapshots tracked where tracked.account_id = changes.account_id and tracked.taken_at <= changes.published_at
        ) then 0 end, views),0))::float8 as views
    from changes where taken_at > ${start.toISOString()}::timestamptz
    group by 1,2 order by 2,1
  `);
  return (result as unknown as { rows: MonthlyGrowthPoint[] }).rows;
}

export function dailyChartSvg(points: MonthlyGrowthPoint[], start: string, end: string, color = "#2671b8"): string | null {
  if (!points.length) return null;
  const day = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0,10);
  const first = day(start), last = day(new Date(new Date(end).getTime()-1).toISOString());
  const days: string[] = [];
  for (let ms = Date.parse(first); ms <= Date.parse(last); ms += 86400_000) days.push(new Date(ms).toISOString().slice(0,10));
  const values = new Map<string, number>();
  for (const p of points) values.set(p.day, (values.get(p.day) ?? 0) + p.views);
  const max = Math.max(1, ...values.values());
  const left = 48, top = 12, width = 460, height = 65, step = width / Math.max(1, days.length);
  const compact = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(Math.round(n));
  const shapes = [0,.5,1].map(f => `<line x1="${left}" y1="${top+height*(1-f)}" x2="${left+width}" y2="${top+height*(1-f)}" stroke="#dbe3eb"/><text x="${left-5}" y="${top+height*(1-f)+3}" text-anchor="end" font-size="9" fill="#536273">${compact(max*f)}</text>`);
  days.forEach((d,i) => {
    const value = values.get(d), x = left + i*step;
    if (value == null) shapes.push(`<rect x="${x+step*.15}" y="${top}" width="${step*.7}" height="${height}" fill="#f0f3f6"/>`);
    else { const h = height*value/max; shapes.push(`<rect x="${x+step*.15}" y="${top+height-h}" width="${step*.7}" height="${Math.max(1,h)}" fill="${color}"/>`); }
    if (i===0 || i===days.length-1 || (i%Math.max(1,Math.ceil(days.length/6))===0)) shapes.push(`<text x="${x+step/2}" y="${top+height+17}" text-anchor="middle" font-size="9" fill="#536273">${d.slice(8)}/${d.slice(5,7)}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="110">${shapes.join("")}</svg>`;
}
