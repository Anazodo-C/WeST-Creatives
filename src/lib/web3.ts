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
 *
 * `appUrl` is NOT optional in practice even though RainbowKit's types allow
 * omitting it: this file runs at module load time, on the server too (this
 * config is imported into every page via the root layout). If `appUrl` is
 * left unset, RainbowKit falls back to
 * `typeof window !== "undefined" ? window.location.origin : ""` — an empty
 * string during Next.js's server-side build/prerendering — which a
 * downstream `new URL(...)` call then throws on, breaking `next build`
 * entirely with "TypeError: Invalid URL" while prerendering `_not-found` (or
 * any other statically-generated page). Set NEXT_PUBLIC_APP_URL to your real
 * deployed domain once you have one; the hardcoded fallback below just
 * needs to be *some* valid absolute URL to keep builds working either way.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://west-creatives.vercel.app";

export const web3Config = getDefaultConfig({
  appName: "West Creatives",
  appUrl: APP_URL,
  appIcon: `${APP_URL}/favicon.ico`,
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [arcTestnet],
  ssr: true,
});
