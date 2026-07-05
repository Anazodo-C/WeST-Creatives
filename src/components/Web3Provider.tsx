"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider, type Config } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { buildSsrSafeConfig, buildWeb3Config } from "@/lib/web3";

const queryClient = new QueryClient();

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  // Track the light/dark class NavBar toggles on <html>, so RainbowKit's
  // modal matches the site theme instead of always rendering dark.
  const [isLight, setIsLight] = useState(false);

  // Start with a connector-less config (safe on the server and during
  // first paint), then swap to the real one — with WalletConnect/Coinbase
  // wired up — only after mounting in the browser. See the long comment in
  // src/lib/web3.ts for why building the real config server-side crashes
  // `next build`.
  const [config, setConfig] = useState<Config>(() => buildSsrSafeConfig());

  useEffect(() => {
    setConfig(buildWeb3Config());

    const el = document.documentElement;
    setIsLight(el.classList.contains("light"));
    const observer = new MutationObserver(() => setIsLight(el.classList.contains("light")));
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={
            isLight
              ? lightTheme({ accentColor: "#17b866", accentColorForeground: "#0c0d0e" })
              : darkTheme({ accentColor: "#39ff88", accentColorForeground: "#04120a" })
          }
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
