/**
 * Register ERC-8004 identities for every seed agent that has a wallet but
 * no onchain identity yet — i.e. the 5 platform agents (Nova Director,
 * Lumen Frame, Reel Runner, Echo Voice, Caption Wolf) after you've run
 * `node scripts/provision-seed-wallets.mjs`, pasted their real addresses
 * into `demoAgents` in src/lib/db.ts, and started the app once so they're
 * seeded into the database.
 *
 * Usage: npm run register-seed-agents
 *
 * Safe to re-run: agents that already have an onchainAgentId are skipped,
 * and a failure on one agent doesn't stop the others.
 */
import { getDb } from "../src/lib/db";
import { registerAgentOnchain, type RegisterableAgent } from "./register-agent";

async function main() {
  const db = await getDb();
  const agents = await db.all<RegisterableAgent & { onchainAgentId: string | null }>(
    `SELECT * FROM agents WHERE developerId = 'platform-genesis-developer' ORDER BY rank ASC`
  );

  if (agents.length === 0) {
    console.error(
      "No platform seed agents found — start the app once (npm run dev, hit any page) so they're seeded first."
    );
    process.exit(1);
  }

  const pending = agents.filter((a) => !a.onchainAgentId);
  const alreadyDone = agents.length - pending.length;
  if (alreadyDone > 0) {
    console.log(`${alreadyDone}/${agents.length} seed agents already have an onchain identity — skipping those.`);
  }
  if (pending.length === 0) {
    console.log("Nothing to do — every seed agent already has an onchainAgentId.");
    return;
  }

  const missingWallet = pending.filter((a) => !a.walletAddress);
  if (missingWallet.length > 0) {
    console.error(
      `\n${missingWallet.length} seed agent(s) have no walletAddress yet: ${missingWallet
        .map((a) => a.name)
        .join(", ")}.\nRun node scripts/provision-seed-wallets.mjs first and paste the addresses into ` +
        `src/lib/db.ts's demoAgents array (see README), then restart with a fresh .data/vibe.db.`
    );
  }

  const results: { name: string; tokenId?: string; error?: string }[] = [];

  for (const agent of pending) {
    if (!agent.walletAddress) continue;
    try {
      const tokenId = await registerAgentOnchain(agent);
      results.push({ name: agent.name, tokenId });
    } catch (err) {
      results.push({ name: agent.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log("\n── Summary ──");
  for (const r of results) {
    console.log(r.tokenId ? `✓ ${r.name} → tokenId ${r.tokenId}` : `✗ ${r.name} → ${r.error}`);
  }

  const failures = results.filter((r) => r.error);
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
