/**
 * Anchor an agent's identity onchain via ERC-8004 on Arc Testnet.
 *
 * Usage:
 *   npm run register-agent -- --agentId=<local-db-id> --metadataUri=ipfs://...
 *
 * Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET (see .env.example). Without
 * them this prints what it *would* do and exits — it will not fabricate a
 * fake onchain transaction.
 *
 * Flow (per https://docs.arc.io/arc/tutorials/register-your-first-ai-agent):
 *   1. Look up (or create) an owner wallet for this agent's developer.
 *   2. Call register(metadataURI) on the IdentityRegistry via Circle's
 *      Contract Execution API — Circle sponsors gas via Gas Station.
 *   3. Poll the transaction until COMPLETE, then read back the minted
 *      tokenId from the Transfer event and store it against the agent.
 */
import { getDb } from "../src/lib/db";
import { ERC8004_CONTRACTS, findLatestAgentIdForOwner } from "../src/lib/arc";

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

const DEFAULT_METADATA_URI =
  "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei";

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const { agentId, metadataUri = DEFAULT_METADATA_URI } = parseArgs();
  if (!agentId) {
    console.error("Usage: npm run register-agent -- --agentId=<id> [--metadataUri=ipfs://...]");
    process.exit(1);
  }

  const db = getDb();
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as
    | { id: string; name: string; walletAddress: string | null }
    | undefined;

  if (!agent) {
    console.error(`No agent found in local DB with id ${agentId}`);
    process.exit(1);
  }

  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    console.log(`[demo mode] Would register "${agent.name}" (${agent.id}) on Arc Testnet:`);
    console.log(`  contract:     ${ERC8004_CONTRACTS.identityRegistry}`);
    console.log(`  metadataURI:  ${metadataUri}`);
    console.log(`  owner wallet: ${agent.walletAddress ?? "(none yet — create one first)"}`);
    console.log("\nSet CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env to run this for real.");
    return;
  }

  if (!agent.walletAddress) {
    console.error("Agent has no wallet address yet — register it via /api/agents/register first.");
    process.exit(1);
  }

  const { initiateDeveloperControlledWalletsClient } = await import(
    "@circle-fin/developer-controlled-wallets"
  );
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });

  console.log(`Registering "${agent.name}" on IdentityRegistry...`);
  const registerTx = await client.createContractExecutionTransaction({
    walletAddress: agent.walletAddress,
    blockchain: "ARC-TESTNET",
    contractAddress: ERC8004_CONTRACTS.identityRegistry,
    abiFunctionSignature: "register(string)",
    abiParameters: [metadataUri],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  } as never);

  const txId = (registerTx as { data?: { id?: string } })?.data?.id;
  let txHash: string | undefined;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = (await client.getTransaction({ id: txId! })) as {
      data?: { transaction?: { state?: string; txHash?: string } };
    };
    if (data?.transaction?.state === "COMPLETE") {
      txHash = data.transaction.txHash;
      break;
    }
    if (data?.transaction?.state === "FAILED") {
      throw new Error("Registration transaction failed");
    }
    process.stdout.write(".");
  }

  if (!txHash) {
    console.error("\nTimed out waiting for confirmation — check the Circle console.");
    process.exit(1);
  }

  console.log(`\nRegistered: https://testnet.arcscan.app/tx/${txHash}`);

  const agentTokenId = await findLatestAgentIdForOwner(
    agent.walletAddress as `0x${string}`
  );
  if (agentTokenId !== null) {
    console.log(`Onchain agent ID (tokenId): ${agentTokenId.toString()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
