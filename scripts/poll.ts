// Run one poll from the command line (e.g. a GitHub Actions schedule or a server crontab).
import { getDb } from "../src/db/client";
import { pollAll } from "../src/lib/poll";

const result = await pollAll(await getDb());
console.log(JSON.stringify(result, null, 2));
process.exit(result.accountsFailed > 0 && result.accountsOk === 0 ? 1 : 0);
