"use client";

import { createConfig, http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "viem/chains";

export { arcTestnet };

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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://west-creatives.vercel.app";

/**
 * IMPORTANT — do not call this at module scope, and do not call it
 * server-side. `getDefaultConfig()` eagerly constructs RainbowKit's full
 * default wallet list, including the WalletConnect and Coinbase Wallet
 * connectors. Deep inside those SDKs (confirmed by reading
 * @walletconnect/utils' `getAppMetadata()`), there's code that falls back to
 * inspecting `window`/`document` for app metadata, and unconditionally
 * calls `new URL(...)` on the result. Passing `appUrl`/`appIcon` explicitly
 * (as done below) does NOT fully prevent this — that fallback still runs
 * and still constructs `new URL('')` internally in one of its own
 * comparisons, which throws server-side where `window` doesn't exist. That
 * crashed `next build` while prerendering `/_not-found` with
 * "TypeError: Invalid URL" even after appUrl/appIcon were set.
 *
 * The reliable fix is architectural, not a parameter: never let this
 * function run anywhere but the browser, after mount. See Web3Provider.tsx,
 * which uses `buildSsrSafeConfig()` below during SSR/first paint (zero
 * connectors — nothing WalletConnect/Coinbase-related to construct, so
 * nothing can throw) and swaps to this real config only in a client-only
 * `useEffect`.
 */
export function buildWeb3Config() {
  return getDefaultConfig({
    appName: "West Creatives",
    appUrl: APP_URL,
    appIcon: `${APP_URL}/favicon.ico`,
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
    chains: [arcTestnet],
    ssr: true,
  });
}

/**
 * Minimal placeholder config used only until Web3Provider mounts on the
 * client. No connectors at all — just enough for wagmi's hooks (useAccount,
 * useConnectModal, etc.) to have a valid context to read from instead of
 * throwing "must be used within WagmiProvider", without touching any
 * wallet-connector SDK that might do unsafe SSR work.
 */
export function buildSsrSafeConfig() {
  return createConfig({
    chains: [arcTestnet],
    transports: { [arcTestnet.id]: http() },
    connectors: [],
    ssr: true,
  });
}
