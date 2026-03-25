import { ensureDatabaseReady } from "../src/lib/server/db.ts";

await ensureDatabaseReady();
console.log("Neon schema ready");
