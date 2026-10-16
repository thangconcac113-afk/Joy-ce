import path from "node:path";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Both drivers expose the same database interface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
const MIGRATIONS = path.join(process.cwd(), "drizzle");
let cached: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  cached ??= open().catch((error) => { cached = undefined; throw error; });
  return cached;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 5 });
    const client = await pool.connect();
    try {
      // Serverless instances must not apply the same pending migration concurrently.
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(817264902)");
      try {
        await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS });
      } finally {
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
      throw error;
    }
    client.release();
    return drizzle(pool, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    throw new Error("DATABASE_URL is required in production.");
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  return openPglite(dir);
}

/** Also used by tests with "memory://". */
export async function openPglite(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}
