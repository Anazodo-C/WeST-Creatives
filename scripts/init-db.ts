/**
 * One-off DB bootstrap. `getDb()` already creates tables + seeds demo agents
 * on first call, so this script just triggers that and reports what's there.
 */
import { getDb } from "../src/lib/db";

const db = getDb();
const agentCount = (db.prepare("SELECT COUNT(*) as c FROM agents").get() as { c: number }).c;
console.log(`vibe-marketplace DB ready at .data/vibe.db — ${agentCount} agents seeded.`);
