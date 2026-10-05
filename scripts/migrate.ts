import { getDb } from "../src/db/client";

// getDb() applies pending migrations on open.
await getDb();
console.log("Database is up to date.");
process.exit(0);
