/**
 * ERC-8004 ValidationRegistry request/response flow on Arc Testnet, in two
 * steps that map onto two separate CLI invocations of this script (they can
 * be minutes or days apart, e.g. while a human/automated validator actually
 * reviews the agent):
 *
 *   1. `request` — the agent's own owner wallet asks a validator wallet to
 *      review it. West Creatives uses its single platform validator wallet
 *      (src/lib/platformWallet.ts, the same one used for reputation feedback
 *      in src/app/api/content/generate/route.ts) as that validator by
 *      default, so there's nothing extra to provision.
 *   2. `respond` — the validator wallet records its verdict against the same
 *      requestHash from step 1.
 *
 * Usage:
 *   npm run validate-agent -- request --agentId=<local-db-id> [--requestURI=...]
 *   npm run validate-agent -- respond --requestId=<validations-table-id> [--response=100] [--tag=quality_check_passed] [--responseURI=...]
 *
 * Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET (see .env.example). Without
 * them this prints what it *would* do and exits, same as register-agent.ts.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/lib/db";
import { requestValidation, submitValidationResponse } from "../src/lib/circle";
import { getOrCreatePlatformValidatorWallet } from "../src/lib/platformWallet";
import { getValidationStatus } from "../src/lib/arc";

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

interface AgentRow {
  id: string;
  name: string;
  walletAddress: string | null;
  onchainAgentId: string | null;
}

interface ValidationRow {
  id: string;
  agentId: string;
  agentTokenId: string;
  requestHash: string;
  ownerWalletAddress: string | null;
  validatorWalletAddress: string | null;
  requestURI: string | null;
  requestTxHash: string | null;
  response: number | null;
  responseTag: string | null;
  responseTxHash: string | null;
  createdAt: string;
  respondedAt: string | null;
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(3)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function runRequest() {
  const { agentId, requestURI } = parseArgs();
  if (!agentId) {
    console.error("Usage: npm run validate-agent -- request --agentId=<id> [--requestURI=...]");
    process.exit(1);
  }

  const db = await getDb();
  const agent = await db.get<AgentRow>("SELECT * FROM agents WHERE id = ?", [agentId]);
  if (!agent) {
    console.error(`No agent found in local DB with id ${agentId}`);
    process.exit(1);
  }
  if (!agent.walletAddress) {
    console.error(`Agent "${agent.name}" has no wallet address yet.`);
    process.exit(1);
  }
  if (!agent.onchainAgentId) {
    console.error(
      `Agent "${agent.name}" has no onchain identity yet — run npm run register-agent -- --agentId=${agentId} first.`
    );
    process.exit(1);
  }

  const resolvedRequestURI =
    requestURI ?? `data:text/plain,west-creatives-quality-check:${agent.id}:${Date.now()}`;

  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    console.log(`[demo mode] Would request validation for "${agent.name}" (tokenId ${agent.onchainAgentId}):`);
    console.log(`  owner wallet:     ${agent.walletAddress}`);
    console.log(`  requestURI:       ${resolvedRequestURI}`);
    console.log("\nSet CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env to run this for real.");
    return;
  }

  const validatorWallet = await getOrCreatePlatformValidatorWallet();
  const requestSeed = `validation_${agent.onchainAgentId}_${Date.now()}`;

  console.log(`Requesting validation for "${agent.name}" from validator ${validatorWallet.address}...`);
  const result = await requestValidation({
    ownerWalletAddress: agent.walletAddress,
    validatorAddress: validatorWallet.address,
    agentTokenId: agent.onchainAgentId,
    requestURI: resolvedRequestURI,
    requestSeed,
  });

  if (result.demo || !result.txHash) {
    console.error(result.warning ?? "Validation request failed or timed out.");
    process.exit(1);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO validations (id, agentId, agentTokenId, requestHash, ownerWalletAddress, validatorWalletAddress, requestURI, requestTxHash, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      agent.id,
      agent.onchainAgentId,
      result.requestHash,
      agent.walletAddress,
      validatorWallet.address,
      resolvedRequestURI,
      result.txHash,
      now,
    ]
  );

  console.log(`Requested: https://testnet.arcscan.app/tx/${result.txHash}`);
  console.log(`requestHash: ${result.requestHash}`);
  console.log(`\nWhen the validator has a verdict, respond with:`);
  console.log(`  npm run validate-agent -- respond --requestId=${id} --response=100`);
}

async function runRespond() {
  const { requestId, response, tag, responseURI } = parseArgs();
  if (!requestId) {
    console.error(
      "Usage: npm run validate-agent -- respond --requestId=<id> [--response=100] [--tag=quality_check_passed] [--responseURI=...]"
    );
    process.exit(1);
  }

  const db = await getDb();
  const row = await db.get<ValidationRow>("SELECT * FROM validations WHERE id = ?", [requestId]);
  if (!row) {
    console.error(`No pending validation request found in local DB with id ${requestId}`);
    process.exit(1);
  }
  if (!row.validatorWalletAddress) {
    console.error("This validation row has no validatorWalletAddress recorded — cannot respond.");
    process.exit(1);
  }
  if (row.responseTxHash) {
    console.log(`Already responded: https://testnet.arcscan.app/tx/${row.responseTxHash}`);
    return;
  }

  const responseValue = response ? Number(response) : 100; // 100 = passed, 0 = failed, per Arc's docs convention
  const responseTag = tag ?? "quality_check_passed";

  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    console.log(`[demo mode] Would submit validation response for requestHash ${row.requestHash}:`);
    console.log(`  validator wallet: ${row.validatorWalletAddress}`);
    console.log(`  response:         ${responseValue}`);
    console.log(`  tag:              ${responseTag}`);
    console.log("\nSet CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env to run this for real.");
    return;
  }

  console.log(`Submitting validation response for requestHash ${row.requestHash}...`);
  const result = await submitValidationResponse({
    validatorWalletAddress: row.validatorWalletAddress,
    requestHash: row.requestHash as `0x${string}`,
    response: responseValue,
    responseURI,
    tag: responseTag,
  });

  if (result.demo || !result.txHash) {
    console.error(result.warning ?? "Validation response failed or timed out.");
    process.exit(1);
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE validations SET response = ?, responseTag = ?, responseTxHash = ?, respondedAt = ? WHERE id = ?`,
    [responseValue, responseTag, result.txHash, now, requestId]
  );

  console.log(`Responded: https://testnet.arcscan.app/tx/${result.txHash}`);

  try {
    const status = await getValidationStatus(row.requestHash as `0x${string}`);
    console.log(`\nOnchain getValidationStatus(${row.requestHash}):`);
    console.log(`  validator: ${status.validatorAddress}`);
    console.log(`  agentId:   ${status.agentId.toString()}`);
    console.log(`  response:  ${status.response}`);
    console.log(`  tag:       ${status.tag}`);
  } catch {
    // Read-back is a nice-to-have confirmation, not required — the write
    // above already succeeded and was persisted locally.
  }
}

async function main() {
  const subcommand = process.argv[2];
  if (subcommand === "request") {
    await runRequest();
  } else if (subcommand === "respond") {
    await runRespond();
  } else {
    console.error("Usage: npm run validate-agent -- <request|respond> [...flags]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
