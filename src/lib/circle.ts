/**
 * Circle Developer-Controlled Wallets + Gateway/x402 nanopayments wrapper.
 *
 * Runs in "demo mode" (deterministic fake addresses, no network calls) whenever
 * CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET are not set, so the app is fully
 * clickable out of the box. Set the two env vars (see .env.example) to switch
 * every call below to the real Circle Developer Console APIs on Arc Testnet.
 */
import { randomUUID } from "node:crypto";
import { keccak256, toHex } from "viem";
import { ERC8004_CONTRACTS } from "./arc";

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

/**
 * Create a new Arc Testnet developer-controlled wallet for a creator, agent,
 * or the platform treasury. Never throws — if the real Circle API call
 * fails for any reason (bad entity secret registration, network hiccup,
 * wallet-set creation failure, etc.) this falls back to a deterministic
 * demo wallet instead of letting the error bubble up into a 500 with no
 * JSON body, which is what was crashing the client's `res.json()` call.
 */
export async function createWallet(label: string): Promise<CreatedWallet & { warning?: string }> {
  const client = await getClient();
  if (!client) {
    return {
      id: randomUUID(),
      address: fakeAddress(label + Date.now()),
      blockchain: "ARC-TESTNET",
      demo: true,
    };
  }

  try {
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
  } catch (err) {
    // Common causes: entity secret ciphertext/registration mismatch, an
    // expired API key, or a transient network error reaching Circle.
    return {
      id: randomUUID(),
      address: fakeAddress(label + Date.now()),
      blockchain: "ARC-TESTNET",
      demo: true,
      warning:
        err instanceof Error
          ? `Real Circle wallet creation failed, using a demo wallet instead: ${err.message}`
          : "Real Circle wallet creation failed, using a demo wallet instead.",
    };
  }
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
    //
    // tokenAddress: "" + blockchain: "ARC-TESTNET" (NOT tokenId) is
    // deliberate: Circle's createTransaction takes either a `tokenId` (a
    // token registered in Circle's system under an id) OR a
    // `tokenAddress`+`blockchain` pair for a native-currency transfer —
    // these are mutually exclusive per Circle's own API (tokenId is typed
    // `never` on the address+blockchain variant and vice versa). Arc
    // Testnet's native gas token *is* USDC (see getNativeUsdcBalance in
    // src/lib/arc.ts — the balance the dashboard displays is a plain RPC
    // read of native balance, no ERC-20 contract involved), so there is no
    // separate "USDC token id" to register or transfer here. Previously
    // this passed `tokenId: process.env.ARC_USDC_TOKEN_ID` (always unset,
    // since no such token id exists for a native asset), which silently
    // sent Circle a request with neither a valid tokenId nor the required
    // blockchain field — Circle rejected it every time, the failure was
    // swallowed by the catch block below, and the "real" balance (read via
    // viem straight from the chain) never moved even with valid API keys.
    // `as never` matches the existing cast pattern in this file for Arc's
    // blockchain literal (see createWallets/executeContractCall below) —
    // the published SDK types haven't caught up to Arc yet.
    const [dev, plat] = await Promise.all([
      client.createTransaction({
        walletId: params.fromWalletId,
        tokenAddress: "",
        blockchain: "ARC-TESTNET",
        destinationAddress: params.developerWalletAddress,
        amount: [developerShare.toString()],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      } as never),
      client.createTransaction({
        walletId: params.fromWalletId,
        tokenAddress: "",
        blockchain: "ARC-TESTNET",
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
    // Common causes on testnet: empty native-USDC balance on fromWalletId
    // (nothing to send), or a walletId that was never a real Circle wallet
    // (e.g. guest sessions).
    return {
      demo: true,
      warning: err instanceof Error ? err.message : "Settlement failed, recorded as unsettled.",
    };
  }
}

export interface RefillReserveDebitResult {
  txHash?: string;
  demo: boolean;
  warning?: string;
}

/**
 * Debits `amountUsdc` of testnet USDC from the platform's dedicated "refill
 * reserve" wallet (see getOrCreatePlatformReserveWallet in
 * src/lib/platformWallet.ts) to PLATFORM_WALLET_ADDRESS, once per
 * generation, for exactly the real-dollar amount that generation cost.
 *
 * This is deliberately separate from settlePaymentSplit's 90/10 creator ->
 * developer/platform split above — that's the marketplace's own creator-
 * facing economics. This debit models a *different* thing per the hackathon
 * constraint (all payments must be testnet USDC today, Arc mainnet isn't
 * live yet): the amount of real USDC the platform would need to convert into
 * provider credits (OpenRouter, ElevenLabs, etc.) to cover what was just
 * spent. Recorded here in testnet USDC now as a stand-in for that future
 * mainnet refill flow — see docs/adr/0001-automatic-openrouter-usdc-topup.md.
 *
 * Never throws — same demo-safe pattern as settlePaymentSplit; a reserve
 * wallet that isn't funded (or CIRCLE_DEMO_MODE) degrades to a recorded-but-
 * unsettled result instead of failing the content-generation request.
 */
export async function debitRefillReserve(params: {
  reserveWalletId: string | null;
  amountUsdc: number;
}): Promise<RefillReserveDebitResult> {
  const client = await getClient();
  const platformAddress = process.env.PLATFORM_WALLET_ADDRESS;
  if (!client || !params.reserveWalletId || !platformAddress) {
    return { demo: true };
  }

  try {
    // Native-currency transfer (tokenAddress: "" + blockchain), not a
    // tokenId transfer — see the matching comment in settlePaymentSplit
    // above for why: Arc Testnet's native gas token *is* USDC, so there's
    // no separate token id to transfer. The previous `tokenId:
    // process.env.ARC_USDC_TOKEN_ID` was always unset and silently failed
    // Circle's validation on every call, which is exactly why this debit
    // never showed up as a real balance change even when triggered.
    const tx = await client.createTransaction({
      walletId: params.reserveWalletId,
      tokenAddress: "",
      blockchain: "ARC-TESTNET",
      destinationAddress: platformAddress,
      amount: [params.amountUsdc.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    } as never);

    return {
      txHash: (tx as { data?: { id?: string } })?.data?.id,
      demo: false,
    };
  } catch (err) {
    // Common causes on testnet: empty reserve wallet balance, or the reserve
    // wallet not yet created for this deployment.
    return {
      demo: true,
      warning: err instanceof Error ? err.message : "Refill-reserve debit failed, recorded as unsettled.",
    };
  }
}

export interface FaucetDripResult {
  demo: boolean;
  message: string;
}

/**
 * Request testnet USDC directly to a wallet via Circle's faucet API
 * (POST /v1/faucet/drips) — the same backend as the public faucet.circle.com
 * UI. Drips 20 USDC per call; Circle caps this at one request per address
 * per blockchain every 2 hours (see https://faucet.circle.com), which is why
 * a 429/"already requested"-style response is translated into a clear
 * message instead of a generic error. Never throws.
 *
 * NOT currently wired into the dashboard UI: this endpoint returned
 * Forbidden for this project's API key (likely a plan/permission tier that
 * doesn't include programmatic faucet access — Circle's docs don't specify
 * which tiers get it). The dashboard's "Get testnet USDC" button links to
 * faucet.circle.com directly instead. Left here in case that changes —
 * swap the external link for a call to /api/wallets/faucet (still present,
 * see src/app/api/wallets/faucet/route.ts) once a key with faucet access
 * confirms this works.
 */
export async function requestFaucetDrip(address: string): Promise<FaucetDripResult> {
  if (CIRCLE_DEMO_MODE) {
    return {
      demo: true,
      message:
        "Demo mode — set CIRCLE_API_KEY to request real testnet USDC. Once set, this drips 20 USDC straight to your wallet via Circle's faucet.",
    };
  }

  try {
    const res = await fetch("https://api.circle.com/v1/faucet/drips", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blockchain: "ARC-TESTNET",
        address,
        usdc: true,
        native: false,
      }),
    });

    if (res.ok) {
      return {
        demo: false,
        message: "20 USDC requested — it should land in your wallet within a minute or two.",
      };
    }

    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const rawMessage = body.message || `Faucet request failed (${res.status}).`;
    const isRateLimited = res.status === 429 || /rate|limit|already|too many/i.test(rawMessage);
    return {
      demo: true,
      message: isRateLimited
        ? "You've already requested testnet USDC recently — Circle's faucet allows one request per wallet every 2 hours. Try again later."
        : rawMessage,
    };
  } catch (err) {
    return {
      demo: true,
      message: err instanceof Error ? `Faucet request failed: ${err.message}` : "Faucet request failed.",
    };
  }
}

export interface ContractCallResult {
  txHash?: string;
  demo: boolean;
  warning?: string;
}

/**
 * Poll a Circle Contract Execution transaction until it lands COMPLETE or
 * FAILED. Shared by every write below (and by scripts/register-agent.ts's
 * IdentityRegistry.register() call) so there's one polling loop instead of
 * a copy per call site.
 */
async function pollTransaction(
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>,
  txId: string,
  label: string
): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = (await client.getTransaction({ id: txId })) as {
      data?: { transaction?: { state?: string; txHash?: string } };
    };
    if (data?.transaction?.state === "COMPLETE") {
      return data.transaction.txHash ?? "";
    }
    if (data?.transaction?.state === "FAILED") {
      throw new Error(`${label} transaction failed`);
    }
  }
  throw new Error(`Timed out waiting for ${label} confirmation — check the Circle console.`);
}

/**
 * Generic ERC-8004 contract write via Circle's Contract Execution API
 * (Gas Station-sponsored, same pattern as scripts/register-agent.ts's
 * IdentityRegistry.register() call). Never throws — every caller below
 * (reputation feedback, validation request/response) should degrade to a
 * recorded-but-unsettled demo result instead of failing the request that
 * triggered it.
 */
export async function executeContractCall(params: {
  walletAddress: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: (string | number)[];
  label: string;
}): Promise<ContractCallResult> {
  const client = await getClient();
  if (!client) return { demo: true };

  try {
    const tx = await client.createContractExecutionTransaction({
      walletAddress: params.walletAddress,
      blockchain: "ARC-TESTNET",
      contractAddress: params.contractAddress,
      abiFunctionSignature: params.abiFunctionSignature,
      abiParameters: params.abiParameters,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    } as never);

    const txId = (tx as { data?: { id?: string } })?.data?.id;
    if (!txId) throw new Error("Circle did not return a transaction id");
    const txHash = await pollTransaction(client, txId, params.label);
    return { txHash, demo: false };
  } catch (err) {
    return {
      demo: true,
      warning:
        err instanceof Error
          ? `${params.label} failed, recorded as unsettled: ${err.message}`
          : `${params.label} failed, recorded as unsettled.`,
    };
  }
}

export interface FeedbackResult extends ContractCallResult {
  feedbackHash?: `0x${string}`;
}

/**
 * Record onchain reputation feedback for an agent via ERC-8004's
 * ReputationRegistry.giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32).
 *
 * Per ERC-8004, agent owners cannot record reputation for their own agents —
 * `validatorWalletAddress` must be a wallet other than the agent's own owner
 * wallet. West Creatives uses a dedicated "platform validator" wallet for
 * this (see getOrCreatePlatformValidatorWallet in src/lib/platformWallet.ts),
 * standing in for the platform's own LLM-as-judge evaluation as the external
 * observer of the agent's work.
 *
 * `score` is 0-100, matching this app's EvaluationResult.score scale directly
 * (Arc's own docs use the same 0-100 convention in their giveFeedback
 * example). Never throws.
 */
export async function giveFeedback(params: {
  validatorWalletAddress: string;
  agentTokenId: string;
  score: number;
  tag: string;
}): Promise<FeedbackResult> {
  const feedbackHash = keccak256(toHex(params.tag));
  const result = await executeContractCall({
    walletAddress: params.validatorWalletAddress,
    contractAddress: ERC8004_CONTRACTS.reputationRegistry,
    abiFunctionSignature: "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
    abiParameters: [params.agentTokenId, params.score.toString(), "0", params.tag, "", "", "", feedbackHash],
    label: "giveFeedback",
  });
  return { ...result, feedbackHash };
}

export interface ValidationRequestResult extends ContractCallResult {
  requestHash: `0x${string}`;
}

/**
 * Step 1 of ERC-8004 validation: the agent's OWNER wallet asks a specific
 * validator wallet to review it (e.g. a quality/KYC-style check). Called
 * from the agent's own wallet, per
 * ValidationRegistry.validationRequest(address,uint256,string,bytes32).
 *
 * `requestSeed` is hashed into the on-chain requestHash and must be unique
 * per request (the same requestHash can only be used once) — include a
 * timestamp or nonce, e.g. `validation_${agentTokenId}_${Date.now()}`.
 */
export async function requestValidation(params: {
  ownerWalletAddress: string;
  validatorAddress: string;
  agentTokenId: string;
  requestURI: string;
  requestSeed: string;
}): Promise<ValidationRequestResult> {
  const requestHash = keccak256(toHex(params.requestSeed));
  const result = await executeContractCall({
    walletAddress: params.ownerWalletAddress,
    contractAddress: ERC8004_CONTRACTS.validationRegistry,
    abiFunctionSignature: "validationRequest(address,uint256,string,bytes32)",
    abiParameters: [params.validatorAddress, params.agentTokenId, params.requestURI, requestHash],
    label: "validationRequest",
  });
  return { ...result, requestHash };
}

/**
 * Step 2 of ERC-8004 validation: the validator wallet responds to a pending
 * request referencing the same requestHash from step 1. `response` follows
 * Arc's docs convention (100 = passed, 0 = failed). Called from the
 * validator wallet, per
 * ValidationRegistry.validationResponse(bytes32,uint8,string,bytes32,string).
 */
export async function submitValidationResponse(params: {
  validatorWalletAddress: string;
  requestHash: `0x${string}`;
  response: number;
  responseURI?: string;
  tag: string;
}): Promise<ContractCallResult> {
  return executeContractCall({
    walletAddress: params.validatorWalletAddress,
    contractAddress: ERC8004_CONTRACTS.validationRegistry,
    abiFunctionSignature: "validationResponse(bytes32,uint8,string,bytes32,string)",
    abiParameters: [
      params.requestHash,
      params.response.toString(),
      params.responseURI ?? "",
      `0x${"0".repeat(64)}`,
      params.tag,
    ],
    label: "validationResponse",
  });
}
