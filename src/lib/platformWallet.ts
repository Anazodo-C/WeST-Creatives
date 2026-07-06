/**
 * The platform's own Circle wallet, used as the "validator" identity for
 * ERC-8004 ReputationRegistry/ValidationRegistry writes.
 *
 * Per ERC-8004, an agent's owner wallet cannot record reputation feedback
 * for its own agent — feedback has to come from a distinct observer wallet.
 * West Creatives' own LLM-as-judge evaluation (src/lib/agents/evaluate.ts)
 * is that observer in practice, so it writes its verdicts onchain through
 * this single platform-owned wallet rather than provisioning one per agent.
 *
 * Looked up (and created once, lazily) the same way every other wallet in
 * this app is: a row in the `wallets` table, keyed by a well-known ownerId
 * sentinel instead of a real user/agent id.
 */
import { getDb } from "./db";
import { createWallet } from "./circle";

export const PLATFORM_VALIDATOR_OWNER_ID = "platform-validator";

export interface PlatformValidatorWallet {
  address: string;
  demo: boolean;
  warning?: string;
}

export async function getOrCreatePlatformValidatorWallet(): Promise<PlatformValidatorWallet> {
  const db = await getDb();
  const existing = await db.get<{ address: string; demo: number }>(
    "SELECT address, demo FROM wallets WHERE ownerId = ? ORDER BY createdAt ASC LIMIT 1",
    [PLATFORM_VALIDATOR_OWNER_ID]
  );
  if (existing) {
    return { address: existing.address, demo: !!existing.demo };
  }

  const wallet = await createWallet("platform-validator");
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO wallets (id, ownerId, address, blockchain, demo, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [wallet.id, PLATFORM_VALIDATOR_OWNER_ID, wallet.address, wallet.blockchain, wallet.demo ? 1 : 0, now]
  );
  return { address: wallet.address, demo: wallet.demo, warning: wallet.warning };
}

/**
 * The platform's "refill reserve" wallet — a dedicated Circle Arc-Testnet
 * wallet, distinct from the validator wallet above, that exists purely so
 * every content generation can debit a testnet-USDC amount equal to its real
 * dollar cost to PLATFORM_WALLET_ADDRESS (see debitRefillReserve in
 * src/lib/circle.ts). This simulates — today, in testnet USDC, per the
 * hackathon's "all payments in test USDC" constraint — the mainnet refill
 * flow ADR-0001 describes (converting USDC into provider credits once Arc
 * mainnet is live). Fund it the same way any other wallet in this app gets
 * testnet USDC: the faucet link already in the dashboard, pointed at this
 * wallet's address.
 */
export const PLATFORM_REFILL_RESERVE_OWNER_ID = "platform-refill-reserve";

export interface PlatformReserveWallet {
  id: string;
  address: string;
  demo: boolean;
  warning?: string;
}

export async function getOrCreatePlatformReserveWallet(): Promise<PlatformReserveWallet> {
  const db = await getDb();
  const existing = await db.get<{ id: string; address: string; demo: number }>(
    "SELECT id, address, demo FROM wallets WHERE ownerId = ? ORDER BY createdAt ASC LIMIT 1",
    [PLATFORM_REFILL_RESERVE_OWNER_ID]
  );
  if (existing) {
    return { id: existing.id, address: existing.address, demo: !!existing.demo };
  }

  const wallet = await createWallet("platform-refill-reserve");
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO wallets (id, ownerId, address, blockchain, demo, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [wallet.id, PLATFORM_REFILL_RESERVE_OWNER_ID, wallet.address, wallet.blockchain, wallet.demo ? 1 : 0, now]
  );
  return { id: wallet.id, address: wallet.address, demo: wallet.demo, warning: wallet.warning };
}
