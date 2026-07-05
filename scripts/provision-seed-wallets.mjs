// One-time provisioning: create real Arc Testnet wallets (via Circle
// Developer-Controlled Wallets) for the platform's five seed agents, so
// the seed data in src/lib/db.ts can ship with real, persistent addresses
// instead of null. Run with: node scripts/provision-seed-wallets.mjs
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
const envText = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

if (!env.CIRCLE_API_KEY || !env.CIRCLE_ENTITY_SECRET) {
  console.error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET not found in .env — aborting.");
  process.exit(1);
}

const { initiateDeveloperControlledWalletsClient } = await import(
  "@circle-fin/developer-controlled-wallets"
);

const client = initiateDeveloperControlledWalletsClient({
  apiKey: env.CIRCLE_API_KEY,
  entitySecret: env.CIRCLE_ENTITY_SECRET,
});

const agentNames = ["Nova Director", "Lumen Frame", "Reel Runner", "Echo Voice", "Caption Wolf"];

let walletSetId = env.CIRCLE_WALLET_SET_ID;
if (!walletSetId) {
  console.log("Creating wallet set...");
  const walletSet = await client.createWalletSet({ name: "west-creatives-seed-agents" });
  walletSetId = walletSet.data?.walletSet?.id;
  console.log("Wallet set id:", walletSetId);
}

console.log(`Creating ${agentNames.length} wallets on ARC-TESTNET...`);
const res = await client.createWallets({
  blockchains: ["ARC-TESTNET"],
  count: agentNames.length,
  walletSetId,
  accountType: "SCA",
});

const wallets = res.data?.wallets ?? [];
if (wallets.length !== agentNames.length) {
  console.error(`Expected ${agentNames.length} wallets, got ${wallets.length}`);
  console.error(JSON.stringify(res, null, 2));
  process.exit(1);
}

console.log("\nResults:");
agentNames.forEach((name, i) => {
  console.log(`${name.padEnd(16)} -> ${wallets[i].address}  (walletId: ${wallets[i].id})`);
});
