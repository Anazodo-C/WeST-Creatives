"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAccount } from "wagmi";
import { ExternalLink, Wallet, Sparkles, Loader2, Copy, Check } from "lucide-react";
import type { ContentRecord } from "@/lib/types";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { status: walletStatus } = useAccount();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [history, setHistory] = useState<ContentRecord[]>([]);
  const [prompt, setPrompt] = useState("");
  const [modality, setModality] = useState<"text" | "image" | "video" | "audio">("text");
  const [budget, setBudget] = useState(0.5);
  const [brand, setBrand] = useState({
    name: "",
    industry: "",
    targetAudience: "",
    goal: "",
    emotion: "",
    colors: "",
  });
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<ContentRecord | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [depositMessage, setDepositMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      fetch(`/api/content/history?creatorId=${encodeURIComponent(oid)}`)
        .then((res) => res.json())
        .then((d) => setHistory(d.records ?? []));

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

  async function handleDeposit() {
    if (!ownerId) return;
    setDepositing(true);
    setDepositMessage(null);
    try {
      const res = await fetch("/api/wallets/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Faucet request failed.");
      if (data.address) setWalletAddress(data.address);
      setDepositMessage(data.message ?? "Request sent.");
    } catch (err) {
      setDepositMessage(err instanceof Error ? err.message : "Faucet request failed.");
    } finally {
      setDepositing(false);
    }
  }

  function handleCopyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // If this session's identity came from a wallet and that wallet is later
  // disconnected, drop it from local storage/state so the dashboard reflects
  // a signed-out account instead of continuing to show stale wallet info.
  // Gated on the confirmed "disconnected" status (not "connecting" /
  // "reconnecting") so a page refresh mid-reconnect doesn't wrongly clear it.
  useEffect(() => {
    if (walletStatus !== "disconnected") return;
    const oid = localStorage.getItem("vibe.ownerId");
    if (oid && oid.startsWith("wallet-")) {
      localStorage.removeItem("vibe.ownerId");
      localStorage.removeItem("vibe.role");
      setOwnerId(null);
      setRole(null);
      setHistory([]);
    }
  }, [walletStatus]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          modality,
          budgetUsdc: budget,
          creatorId: ownerId,
          brand: {
            ...brand,
            colors: brand.colors ? brand.colors.split(",").map((c) => c.trim()) : [],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      setLastResult(data);
      setHistory((h) => [data, ...h]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

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

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <div className="neon-border rounded-2xl bg-surface p-5 md:col-span-2">
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleDeposit}
              disabled={depositing || !walletAddress}
              className="flex items-center gap-2 rounded-full bg-neon px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
            >
              {depositing && <Loader2 size={12} className="animate-spin" />}
              {depositing ? "Requesting..." : "Deposit USDC"}
            </button>
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full border border-border-subtle px-4 py-2 text-xs hover:border-neon-dim"
            >
              Faucet website <ExternalLink size={12} />
            </a>
          </div>
          {depositMessage && (
            <p className="mt-2 text-xs text-muted">{depositMessage}</p>
          )}
        </div>

        <div className="neon-border rounded-2xl bg-surface p-5">
          <div className="text-sm font-semibold">Content generated</div>
          <div className="mt-2 text-3xl font-extrabold text-neon">{history.length}</div>
          <div className="mt-1 text-xs text-muted">across all modalities</div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="neon-border rounded-2xl bg-surface p-6">
          <h2 className="font-bold">Brief your agent</h2>
          <form onSubmit={handleGenerate} className="mt-4 space-y-3">
            <textarea
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What do you want created?"
              rows={3}
              className="w-full rounded-xl border border-border-subtle bg-background px-3 py-2 text-sm outline-none focus:border-neon-dim"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as typeof modality)}
                className="rounded-xl border border-border-subtle bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value))}
                className="rounded-xl border border-border-subtle bg-background px-3 py-2 text-sm outline-none"
                placeholder="Budget (USDC)"
              />
            </div>

            <details className="rounded-xl border border-border-subtle bg-background p-3 text-sm">
              <summary className="cursor-pointer text-muted">Brand data (optional)</summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["name", "industry", "targetAudience", "goal", "emotion", "colors"] as const).map(
                  (field) => (
                    <input
                      key={field}
                      value={brand[field]}
                      onChange={(e) => setBrand({ ...brand, [field]: e.target.value })}
                      placeholder={field}
                      className="rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs outline-none"
                    />
                  )
                )}
              </div>
            </details>

            <button
              type="submit"
              disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon py-2.5 font-semibold text-black disabled:opacity-50"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? "Generating..." : "Generate"}
            </button>
          </form>

          {lastResult && (
            <div className="mt-4 rounded-xl border border-neon-dim bg-neon/5 p-4 text-sm">
              <div className="text-muted">Evaluation score</div>
              <div className="text-2xl font-bold text-neon">{lastResult.evaluation.score}/100</div>
              <p className="mt-2 whitespace-pre-wrap text-xs text-muted">
                {lastResult.output.startsWith("data:") ? "(binary output generated)" : lastResult.output}
              </p>
            </div>
          )}
        </div>

        <div className="neon-border rounded-2xl bg-surface p-6">
          <h2 className="font-bold">Content history</h2>
          <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-1">
            {history.length === 0 && (
              <p className="text-sm text-muted">Nothing generated yet.</p>
            )}
            {history.map((r) => (
              <div key={r.id} className="rounded-xl border border-border-subtle bg-background p-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="capitalize">{r.modality}</span>
                  <span>{r.costUsdc} USDC</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{r.prompt}</p>
                <div className="mt-1 text-xs text-neon">score {r.evaluation?.score ?? "-"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
