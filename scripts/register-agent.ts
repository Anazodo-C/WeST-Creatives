/**
 * Anchor an agent's identity onchain via ERC-8004 on Arc Testnet.
 *
 * Usage:
 *   npm run register-agent -- --agentId=<local-db-id> [--metadataUri=ipfs://...]
 *
 * Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET (see .env.example). Without
 * them this prints what it *would* do and exits — it will not fabricate a
 * fake onchain transaction.
 *
 * Flow (per https://docs.arc.io/arc/tutorials/register-your-first-ai-agent):
 *   1. Look up the agent's own Circle wallet (created via
 *      /api/agents/register or scripts/provision-seed-wallets.mjs).
 *   2. Build a metadataURI: unless one is passed explicitly, this generates
 *      one from the agent's own row (name, description, type, capabilities,
 *      model, niche, score, price) as a base64 `data:application/json`
 *      URI — no IPFS pinning service or live domain required, so every
 *      agent gets its own real identity instead of all agents sharing one
 *      generic placeholder.
 *   3. Call register(metadataURI) on the IdentityRegistry via Circle's
 *      Contract Execution API — Circle sponsors gas via Gas Station.
 *   4. Poll the transaction until COMPLETE, read back the minted tokenId
 *      from the Transfer event, and persist it to the agent's
 *      `onchainAgentId` column so the rest of the app can surface it.
 */
import { getDb } from "../src/lib/db";
import { ERC8004_CONTRACTS, findLatestAgentIdForOwner } from "../src/lib/arc";

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

export interface RegisterableAgent {
  id: string;
  name: string;
  description: string | null;
  type: string;
  capabilities: string | null;
  model: string | null;
  nicheIndustry: string | null;
  score: number | null;
  priceUsdc: number | null;
  walletAddress: string | null;
}

/** Build a self-contained data: URI metadata blob from the agent's own row — no external hosting needed. */
export function buildAgentMetadataUri(agent: RegisterableAgent): string {
  const metadata = {
    name: agent.name,
    description: agent.description ?? undefined,
    type: agent.type,
    model: agent.model ?? undefined,
    capabilities: agent.capabilities ? JSON.parse(agent.capabilities) : [],
    niche: agent.nicheIndustry ?? undefined,
    score: agent.score ?? undefined,
    priceUsdc: agent.priceUsdc ?? undefined,
    platform: "West Creatives",
  };
  const json = JSON.stringify(metadata);
  const base64 = Buffer.from(json, "utf8").toString("base64");
  return `data:application/json;base64,${base64}`;
}

/**
 * Registers one agent's identity onchain. Returns the minted tokenId (as a
 * string) on success. Throws on failure — callers loop over multiple agents
 * should catch per-agent so one failure doesn't stop the rest.
 */
export async function registerAgentOnchain(
  agent: RegisterableAgent,
  metadataUriOverride?: string
): Promise<string> {
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET not set — cannot register for real.");
  }
  if (!agent.walletAddress) {
    throw new Error(`Agent "${agent.name}" has no wallet address yet.`);
  }

  const metadataUri = metadataUriOverride ?? buildAgentMetadataUri(agent);

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
    throw new Error("Timed out waiting for confirmation — check the Circle console.");
  }

  console.log(`\nRegistered: https://testnet.arcscan.app/tx/${txHash}`);

  const agentTokenId = await findLatestAgentIdForOwner(agent.walletAddress as `0x${string}`);
  if (agentTokenId === null) {
    throw new Error("Registered onchain, but couldn't resolve the minted tokenId from logs.");
  }

  const db = await getDb();
  await db.run("UPDATE agents SET onchainAgentId = ? WHERE id = ?", [
    agentTokenId.toString(),
    agent.id,
  ]);

  console.log(`Onchain agent ID (tokenId): ${agentTokenId.toString()} — saved to the agent's record.`);
  return agentTokenId.toString();
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const { agentId, metadataUri } = parseArgs();
  if (!agentId) {
    console.error("Usage: npm run register-agent -- --agentId=<id> [--metadataUri=ipfs://...]");
    process.exit(1);
  }

  const db = await getDb();
  const agent = await db.get<RegisterableAgent>("SELECT * FROM agents WHERE id = ?", [agentId]);

  if (!agent) {
    console.error(`No agent found in local DB with id ${agentId}`);
    process.exit(1);
  }

  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    const previewUri = metadataUri ?? buildAgentMetadataUri(agent);
    console.log(`[demo mode] Would register "${agent.name}" (${agent.id}) on Arc Testnet:`);
    console.log(`  contract:     ${ERC8004_CONTRACTS.identityRegistry}`);
    console.log(`  metadataURI:  ${previewUri.slice(0, 80)}${previewUri.length > 80 ? "…" : ""}`);
    console.log(`  owner wallet: ${agent.walletAddress ?? "(none yet — create one first)"}`);
    console.log("\nSet CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env to run this for real.");
    return;
  }

  if (!agent.walletAddress) {
    console.error("Agent has no wallet address yet — register it via /api/agents/register first.");
    process.exit(1);
  }

  await registerAgentOnchain(agent, metadataUri);
}

// Only run the CLI entrypoint when this file is executed directly (e.g. via
// `tsx scripts/register-agent.ts`), not when imported by
// scripts/register-seed-agents.ts.
if (process.argv[1]?.endsWith("register-agent.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
