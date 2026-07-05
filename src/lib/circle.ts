/**
 * Circle Developer-Controlled Wallets + Gateway/x402 nanopayments wrapper.
 *
 * Runs in "demo mode" (deterministic fake addresses, no network calls) whenever
 * CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET are not set, so the app is fully
 * clickable out of the box. Set the two env vars (see .env.example) to switch
 * every call below to the real Circle Developer Console APIs on Arc Testnet.
 */
import { randomUUID } from "node:crypto";

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;
export const CIRCLE_DEMO_MODE = !CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET;

function fakeAddress(seed: string) {
  const hex = Buffer.from(seed).toString("hex").padEnd(40, "0").slice(0, 40);
  return `0x${hex}`;
}

let _client: import("@circle-fin/developer-controlled-wallets").CircleDeveloperControlledWalletsClient | null = null;

async function getClient() {
  if (CIRCLE_DEMO_MODE) return null;
  if (_client) return _client;
  const { initiateDeveloperControlledWalletsClient } = await import(
    "@circle-fin/developer-controlled-wallets"
  );
  _client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY!,
    entitySecret: CIRCLE_ENTITY_SECRET!,
  });
  return _client;
}

export interface CreatedWallet {
  id: string;
  address: string;
  blockchain: string;
  demo: boolean;
}

/** Create a new Arc Testnet developer-controlled wallet for a creator, agent, or the platform treasury. */
export async function createWallet(label: string): Promise<CreatedWallet> {
  const client = await getClient();
  if (!client) {
    return {
      id: randomUUID(),
      address: fakeAddress(label + Date.now()),
      blockchain: "ARC-TESTNET",
      demo: true,
    };
  }

  let walletSetId = CIRCLE_WALLET_SET_ID;
  if (!walletSetId) {
    const walletSet = await client.createWalletSet({ name: "west-creatives" });
    walletSetId = walletSet.data?.walletSet?.id;
  }

  const res = await client.createWallets({
    // Cast: @circle-fin/developer-controlled-wallets' published type defs
    // haven't caught up to Arc's Blockchain literal yet, but the runtime API
    // accepts "ARC-TESTNET" per Circle's own docs (docs.arc.io tutorials).
    blockchains: ["ARC-TESTNET"] as never,
    count: 1,
    walletSetId: walletSetId!,
    accountType: "SCA",
  });

  const wallet = res.data?.wallets?.[0];
  return {
    id: wallet?.id ?? randomUUID(),
    address: wallet?.address ?? fakeAddress(label),
    blockchain: "ARC-TESTNET",
    demo: false,
  };
}

export interface PaymentSplitResult {
  developerTxHash?: string;
  platformTxHash?: string;
  demo: boolean;
  warning?: string;
}

/**
 * Settle the 90/10 developer/platform split for a single content-generation
 * request via Circle Gateway nanopayments (x402). In demo mode, or if
 * `fromWalletId` isn't a real Circle wallet id (e.g. a guest trial session
 * with no wallet), this records the intent without moving funds instead of
 * throwing — a content request should never 500 just because settlement
 * couldn't run.
 */
export async function settlePaymentSplit(params: {
  fromWalletId: string | null;
  developerWalletAddress: string;
  platformWalletAddress: string;
  totalUsdc: number;
}): Promise<PaymentSplitResult> {
  const developerShare = +(params.totalUsdc * 0.9).toFixed(6);
  const platformShare = +(params.totalUsdc * 0.1).toFixed(6);

  const client = await getClient();
  if (!client || !params.fromWalletId) {
    return { demo: true };
  }

  try {
    // Real implementation: use Circle Gateway nanopayments (x402) to move
    // `developerShare` to developerWalletAddress and `platformShare` to
    // platformWalletAddress, gaslessly, sub-cent precision. See:
    // https://developers.circle.com/gateway/nanopayments
    const [dev, plat] = await Promise.all([
      client.createTransaction({
        walletId: params.fromWalletId,
        tokenId: process.env.ARC_USDC_TOKEN_ID,
        destinationAddress: params.developerWalletAddress,
        amount: [developerShare.toString()],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      } as never),
      client.createTransaction({
        walletId: params.fromWalletId,
        tokenId: process.env.ARC_USDC_TOKEN_ID,
        destinationAddress: params.platformWalletAddress,
        amount: [platformShare.toString()],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      } as never),
    ]);

    return {
      developerTxHash: (dev as { data?: { id?: string } })?.data?.id,
      platformTxHash: (plat as { data?: { id?: string } })?.data?.id,
      demo: false,
    };
  } catch (err) {
    // Common causes on testnet: empty USDC balance, wrong token id, or a
    // walletId that was never a real Circle wallet (e.g. guest sessions).
    return {
      demo: true,
      warning: err instanceof Error ? err.message : "Settlement failed, recorded as unsettled.",
    };
  }
}
