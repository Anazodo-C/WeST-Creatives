"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "viem/chains";

/**
 * Wagmi/RainbowKit config, targeting Arc Testnet (matches the ERC-8004 +
 * Circle payment rails used server-side in src/lib/arc.ts and circle.ts).
 *
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is optional — get a free one at
 * https://cloud.reown.com (formerly WalletConnect Cloud) to enable
 * WalletConnect / mobile QR sign-in. Without a real project id, injected
 * browser wallets (MetaMask, Rabby, Coinbase Wallet extension, etc.) still
 * connect fine, but the console will show "Origin ... not found on
 * Allowlist" — that's Reown rejecting the placeholder id below, not a bug.
 * Add your real project id, and add this app's origin(s) under that
 * project's "Allowed Origins" in the Reown dashboard, to clear it.
 */
export const web3Config = getDefaultConfig({
  appName: "West Creatives",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [arcTestnet],
  ssr: true,
});
