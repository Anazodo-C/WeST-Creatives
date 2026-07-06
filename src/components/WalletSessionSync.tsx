"use client";

/**
 * Watches wagmi's wallet connection status app-wide and treats a real
 * disconnect as an actual sign-out: clears the locally-stored account
 * (vibe.ownerId/vibe.role) and sends the person back to the homepage,
 * which — once ownerId is gone — renders as the signed-out/guest
 * experience (see HomeCta.tsx).
 *
 * Previously this same clearing logic lived only inside
 * src/app/dashboard/page.tsx, gated on the confirmed "disconnected"
 * status. Two problems with that: (1) it only ever ran while the
 * dashboard page itself was mounted, so disconnecting from any other page
 * (/agents, /analytics, the homepage) did nothing until the next dashboard
 * visit; (2) it never navigated anywhere — it just cleared local state in
 * place, so "disconnect" didn't actually feel like being signed out.
 *
 * Mounted once in the root layout (inside Web3Provider so useAccount has
 * wagmi context, and inside NotificationProvider so it can toast), so it
 * fires regardless of which page the disconnect happens on.
 *
 * Only reacts to a genuine connected -> disconnected transition (tracked
 * via the wasConnected ref), not merely "disconnected" being the status at
 * some arbitrary read. That distinction matters on cold load: if a wallet
 * extension hasn't unlocked yet, or a previous session's connector fails
 * to silently reconnect, wagmi's status can read "disconnected" without
 * the person ever having clicked anything — wiping their account in that
 * case would be wrong. Only an observed connected -> disconnected edge
 * (i.e. they were connected in this browser tab, then explicitly
 * disconnected, e.g. via RainbowKit's own account menu) counts.
 */
import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useNotifications } from "@/components/NotificationProvider";

export default function WalletSessionSync() {
  const { status } = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const { notify } = useNotifications();
  const wasConnected = useRef(false);

  useEffect(() => {
    if (status === "connected") {
      wasConnected.current = true;
      return;
    }

    if (status === "disconnected" && wasConnected.current) {
      wasConnected.current = false;
      const oid = localStorage.getItem("vibe.ownerId");
      if (oid && oid.startsWith("wallet-")) {
        localStorage.removeItem("vibe.ownerId");
        localStorage.removeItem("vibe.role");
        notify("Wallet disconnected — you're signed out.", "info");
        if (pathname !== "/") router.push("/");
      }
    }
  }, [status, pathname, router, notify]);

  return null;
}
