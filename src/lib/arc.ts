/**
 * Arc Testnet + ERC-8004 IdentityRegistry helpers.
 * Contract addresses + ABI shape from
 * https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 *
 * IdentityRegistry is an ERC-721-style NFT registry: register(metadataURI)
 * mints an identity token, ownerOf/tokenURI read it back, and the Transfer
 * event tells you the minted agentId.
 */
import { createPublicClient, http, getContract, parseAbiItem, type Address } from "viem";
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
