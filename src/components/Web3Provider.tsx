"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { web3Config } from "@/lib/web3";

const queryClient = new QueryClient();

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  // Track the light/dark class NavBar toggles on <html>, so RainbowKit's
  // modal matches the site theme instead of always rendering dark.
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    setIsLight(el.classList.contains("light"));
    const observer = new MutationObserver(() => setIsLight(el.classList.contains("light")));
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <WagmiProvider config={web3Config}>
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
