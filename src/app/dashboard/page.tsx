"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAccount } from "wagmi";
import { ExternalLink, Wallet, Sparkles, Loader2, Copy, Check, RefreshCw, Download } from "lucide-react";
import type { ContentRecord } from "@/lib/types";

/** Sniff a data: URI's media type so output can be previewed/downloaded correctly.
 * Matches any encoding token (";base64,", ";utf8,", etc.) — the demo image
 * placeholder in particular is a URL-encoded SVG ("data:image/svg+xml;utf8,..."),
 * not base64, and previously fell through to "text" (downloading as a .txt
 * file full of URL-escaped SVG markup instead of rendering as an image). */
function outputMeta(output: string): { kind: "image" | "audio" | "video" | "text"; extension: string } {
  const match = output.match(/^data:([a-z0-9]+)\/([a-z0-9.+-]+);[a-z0-9-]+,/i);
  if (!match) return { kind: "text", extension: "txt" };
  const [, type, subtype] = match;
  const extension = subtype === "mpeg" ? "mp3" : subtype.split("+")[0] || "bin";
  if (type === "image" || type === "audio" || type === "video") {
    return { kind: type, extension };
  }
  return { kind: "text", extension: "txt" };
}

/** Renders generated content with an actual preview + a real download link — for
 * data: URI outputs (image/audio/video) that used to just show
 * "(binary output generated)" with no way to see or save them. */
function OutputPreview({ output, filenameBase }: { output: string; filenameBase: string }) {
  const meta = outputMeta(output);
  const downloadHref = meta.kind === "text" ? `data:text/plain;charset=utf-8,${encodeURIComponent(output)}` : output;
  const filename = `${filenameBase}.${meta.extension}`;

  return (
    <div className="mt-2 space-y-2">
      {meta.kind === "image" && (
        <img src={output} alt="Generated output" className="max-h-64 rounded-lg border border-border-subtle" />
      )}
      {meta.kind === "audio" && <audio controls src={output} className="w-full" />}
      {meta.kind === "video" && (
        <video controls src={output} className="max-h-64 w-full rounded-lg border border-border-subtle" />
      )}
      {meta.kind === "text" && (
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-foreground">
          {output}
        </p>
      )}
      <a
        href={downloadHref}
        download={filename}
        className="inline-flex items-center gap-1 text-xs text-neon hover:underline"
      >
        <Download size={12} /> Download {meta.kind === "text" ? "as .txt" : meta.kind}
      </a>
    </div>
  );
}

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
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              <OutputPreview output={lastResult.output} filenameBase={`west-creatives-${lastResult.id}`} />
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
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-neon">score {r.evaluation?.score ?? "-"}</span>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="text-xs text-muted underline hover:text-neon"
                  >
                    {expandedId === r.id ? "Hide" : "View / download"}
                  </button>
                </div>
                {expandedId === r.id && (
                  <OutputPreview output={r.output} filenameBase={`west-creatives-${r.id}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
