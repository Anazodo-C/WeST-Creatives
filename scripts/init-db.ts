/**
 * One-off DB bootstrap. `getDb()` already creates tables + seeds demo agents
 * on first call, so this script just triggers that and reports what's there.
 */
import { getDb, DB_BACKEND } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const row = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM agents");
  const where = DB_BACKEND === "postgres" ? "Postgres (DATABASE_URL)" : ".data/vibe.db";
  console.log(`vibe-marketplace DB ready at ${where} — ${row?.c ?? 0} agents seeded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
