"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "viem/chains";

/**
 * Wagmi/RainbowKit config, targeting Arc Testnet (matches the ERC-8004 +
 * Circle payment rails used server-side in src/lib/arc.ts and circle.ts).
 *
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is optional — get a free one at
 * https://cloud.walletconnect.com to enable WalletConnect / mobile QR sign-in.
 * Without it, injected browser wallets (MetaMask, Rabby, Coinbase Wallet
 * extension, etc.) still connect fine.
 */
export const web3Config = getDefaultConfig({
  appName: "West Creatives",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [arcTestnet],
  ssr: true,
});
