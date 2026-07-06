"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink, Wallet, Copy, Check, RefreshCw } from "lucide-react";
import CreatorDashboard from "@/components/CreatorDashboard";
import DeveloperDashboard from "@/components/DeveloperDashboard";

/**
 * Shared dashboard shell: figures out who's signed in and which role they
 * picked at signup (creator vs developer — see src/app/signup/page.tsx),
 * provisions/loads their wallet, and renders the matching role-specific
 * dashboard below it. The wallet card itself is identical for both roles
 * (every account gets a Circle wallet regardless of role), so it lives here
 * instead of being duplicated in both CreatorDashboard and
 * DeveloperDashboard.
 */
export default function DashboardPage() {
  const { data: session } = useSession();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    let oid = localStorage.getItem("vibe.ownerId");
    let r = localStorage.getItem("vibe.role");

    // Signed in via Google but this browser/profile never provisioned
    // locally (e.g. new device) — derive the same stable ownerId signup
    // would have used, so history still resolves correctly.
    if (!oid && session?.user?.email) {
      oid = `google-${session.user.email}`;
      r = r ?? "creator";
    }

    setOwnerId(oid);
    setRole(r);
    if (oid) {
      // Get-or-create this owner's wallet so the address actually shows up
      // instead of the permanent "appears after your first..." placeholder —
      // idempotent, same call signup already makes, safe to repeat here.
      fetch("/api/wallets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: oid, label: oid }),
      })
        .then((res) => res.json())
        .then((d) => {
          if (d.address) setWalletAddress(d.address);
        })
        .catch(() => {
          // Non-critical — the wallet card just keeps showing the placeholder.
        });
    }
  }, [session?.user?.email]);

  async function fetchBalance(address: string) {
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/wallets/balance?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (res.ok) setBalance(data.balance);
    } catch {
      // Non-critical — balance just stays unset, refresh button lets them retry.
    } finally {
      setBalanceLoading(false);
    }
  }

  useEffect(() => {
    if (walletAddress) fetchBalance(walletAddress);
  }, [walletAddress]);

  function handleCopyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Wallet disconnect handling (clearing ownerId/role + redirecting home)
  // now lives app-wide in src/components/WalletSessionSync.tsx, mounted in
  // the root layout — it fires regardless of which page the disconnect
  // happens on, not just while this page is mounted.

  if (!ownerId) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-muted">
          No account found in this browser yet.{" "}
          <a href="/signup" className="text-neon underline">
            Sign up
          </a>{" "}
          to get a wallet and your first agent.
        </p>
        <button
          onClick={() => {
            localStorage.setItem("vibe.ownerId", "guest-trial");
            localStorage.setItem("vibe.role", "creator");
            window.location.reload();
          }}
          className="mt-4 text-sm text-muted underline hover:text-neon"
        >
          Or try it out as a guest, no account needed
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Dashboard</h1>
      <p className="mt-2 text-muted">
        Signed in as <span className="text-foreground">{ownerId}</span> ({role})
      </p>

      <div className="mt-8 neon-border rounded-2xl bg-surface p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Wallet size={16} className="text-neon" /> Wallet
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-background px-3 py-2">
          <span className="truncate font-mono text-xs text-muted">
            {walletAddress || "Provisioning your wallet…"}
          </span>
          {walletAddress && (
            <button
              onClick={handleCopyAddress}
              title="Copy address"
              className="shrink-0 text-muted hover:text-neon"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Balance:</span>
          <span className="font-semibold text-neon">
            {balance !== null ? `${(+balance).toFixed(4)} USDC` : "—"}
          </span>
          {walletAddress && (
            <button
              onClick={() => fetchBalance(walletAddress)}
              disabled={balanceLoading}
              title="Refresh balance"
              className="text-muted hover:text-neon disabled:opacity-50"
            >
              <RefreshCw size={12} className={balanceLoading ? "animate-spin" : ""} />
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-full bg-neon px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
          >
            Get testnet USDC <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {role === "developer" ? <DeveloperDashboard ownerId={ownerId} /> : <CreatorDashboard ownerId={ownerId} />}
    </div>
  );
}
