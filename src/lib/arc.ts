/**
 * Arc Testnet + ERC-8004 IdentityRegistry helpers.
 * Contract addresses + ABI shape from
 * https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 *
 * IdentityRegistry is an ERC-721-style NFT registry: register(metadataURI)
 * mints an identity token, ownerOf/tokenURI read it back, and the Transfer
 * event tells you the minted agentId.
 */
import { createPublicClient, http, getContract, parseAbiItem, formatEther, type Address } from "viem";
import { arcTestnet } from "viem/chains";

export const ERC8004_CONTRACTS = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
  validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as Address,
};

export const IDENTITY_REGISTRY_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * ValidationRegistry — read side only here (the write side, requestValidation
 * + submitValidationResponse, goes through Circle's Contract Execution API in
 * src/lib/circle.ts, same as IdentityRegistry.register()). getValidationStatus
 * is a plain view function so it's cheap to read directly via viem.
 */
export const VALIDATION_REGISTRY_ABI = [
  {
    inputs: [{ name: "requestHash", type: "bytes32" }],
    name: "getValidationStatus",
    outputs: [
      { name: "validatorAddress", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "response", type: "uint8" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" },
      { name: "lastUpdate", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function getValidationStatus(requestHash: `0x${string}`) {
  const client = getArcPublicClient();
  const contract = getContract({
    address: ERC8004_CONTRACTS.validationRegistry,
    abi: VALIDATION_REGISTRY_ABI,
    client,
  });
  const [validatorAddress, agentId, response, responseHash, tag, lastUpdate] =
    await contract.read.getValidationStatus([requestHash]);
  return { validatorAddress, agentId, response, responseHash, tag, lastUpdate };
}

export function getArcPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL),
  });
}

export async function resolveAgentIdentity(agentId: bigint) {
  const client = getArcPublicClient();
  const contract = getContract({
    address: ERC8004_CONTRACTS.identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    client,
  });
  const [owner, tokenURI] = await Promise.all([
    contract.read.ownerOf([agentId]),
    contract.read.tokenURI([agentId]),
  ]);
  return { owner, tokenURI };
}

export async function findLatestAgentIdForOwner(ownerAddress: Address) {
  const client = getArcPublicClient();
  const latestBlock = await client.getBlockNumber();
  const blockRange = 10000n;
  const fromBlock = latestBlock > blockRange ? latestBlock - blockRange : 0n;

  const logs = await client.getLogs({
    address: ERC8004_CONTRACTS.identityRegistry,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
    ),
    args: { to: ownerAddress },
    fromBlock,
    toBlock: latestBlock,
  });

  if (logs.length === 0) return null;
  return logs[logs.length - 1].args.tokenId ?? null;
}

export const ARC_DEMO_MODE = !process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET;

/**
 * Arc Testnet's native gas token *is* USDC (per viem's built-in arcTestnet
 * chain definition: nativeCurrency = { name: "USDC", symbol: "USDC",
 * decimals: 18 }) — so a wallet's USDC balance is just its native balance,
 * no ERC-20 contract call needed. Returns a plain decimal string (e.g.
 * "12.5"), formatted with formatEther since the chain uses the same
 * 18-decimal convention as any other EVM native currency. Demo/fake
 * addresses (no real key set) simply read back as "0" — this is a public,
 * unauthenticated RPC read, so it works with or without Circle keys.
 */
export async function getNativeUsdcBalance(address: Address): Promise<string> {
  const client = getArcPublicClient();
  const balance = await client.getBalance({ address });
  return formatEther(balance);
}
