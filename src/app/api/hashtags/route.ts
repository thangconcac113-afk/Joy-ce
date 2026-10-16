import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { parseFilters,withUser } from "@/lib/api";
export const dynamic="force-dynamic";
export function GET(req:Request){return withUser(async()=>{
 const f=parseFilters(new URL(req.url)); const clauses=[sql`true`];
 if(f.platform!=="all")clauses.push(sql`a.platform = ${f.platform}`);
 if(f.accountId)clauses.push(sql`a.id = ${f.accountId}`);
 const data=await(await getDb()).execute(sql`select tag, count(*)::int as videos from videos v join accounts a on a.id=v.account_id cross join lateral unnest(v.hashtags) tag where ${sql.join(clauses,sql` and `)} group by tag order by count(*) desc, tag limit 200`);
 return NextResponse.json({hashtags:(data as unknown as {rows:{tag:string;videos:number}[]}).rows});
});}
