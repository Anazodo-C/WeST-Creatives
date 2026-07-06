"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAccount } from "wagmi";
import { ExternalLink, Wallet, Sparkles, Loader2, Copy, Check, RefreshCw, Download } from "lucide-react";
import type { ContentRecord } from "@/lib/types";
import { AGENT_PRICE_USDC } from "@/lib/pricing";

type OutputKind = "image" | "audio" | "video" | "text";

/** Sniff a data: URI's media type so output can be previewed/downloaded correctly.
 * Matches any encoding token (";base64,", ";utf8,", etc.) — the demo image
 * placeholder in particular is a URL-encoded SVG ("data:image/svg+xml;utf8,..."),
 * not base64, and previously fell through to "text" (downloading as a .txt
 * file full of URL-escaped SVG markup instead of rendering as an image).
 *
 * Some providers (e.g. fal.ai, if sync_mode isn't honored for a given model)
 * return a hosted https:// URL instead of a data: URI — for those, fall back
 * to the caller-supplied modality instead of misreading them as plain text. */
function outputMeta(output: string, modalityHint?: OutputKind): { kind: OutputKind; extension: string } {
  const dataMatch = output.match(/^data:([a-z0-9]+)\/([a-z0-9.+-]+);[a-z0-9-]+,/i);
  if (dataMatch) {
    const [, type, subtype] = dataMatch;
    const extension = subtype === "mpeg" ? "mp3" : subtype.split("+")[0] || "bin";
    if (type === "image" || type === "audio" || type === "video") {
      return { kind: type, extension };
    }
    return { kind: "text", extension: "txt" };
  }

  if (/^https?:\/\//i.test(output) && modalityHint && modalityHint !== "text") {
    const lastSegment = output.split(/[?#]/)[0].split(".").pop() ?? "";
    const extension = /^[a-z0-9]{2,4}$/i.test(lastSegment) ? lastSegment : { image: "png", audio: "mp3", video: "mp4" }[modalityHint];
    return { kind: modalityHint, extension };
  }

  return { kind: "text", extension: "txt" };
}

/** Renders generated content with an actual preview + a real download link — for
 * data: URI or hosted-URL outputs (image/audio/video) that used to just show
 * "(binary output generated)" with no way to see or save them. */
function OutputPreview({
  output,
  filenameBase,
  modalityHint,
}: {
  output: string;
  filenameBase: string;
  modalityHint?: OutputKind;
}) {
  const meta = outputMeta(output, modalityHint);
  const isHostedUrl = /^https?:\/\//i.test(output);
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
        target={isHostedUrl ? "_blank" : undefined}
        rel={isHostedUrl ? "noreferrer" : undefined}
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
  // Defaults to the selected content type's actual nanopayment cost
  // (src/lib/pricing.ts) rather than an arbitrary flat guess, and re-syncs
  // whenever the content type changes (see the effect below) — still fully
  // editable, this is just a sane starting point so the very first submit
  // doesn't fail with "Budget too low" for no obvious reason.
  const [budget, setBudget] = useState(AGENT_PRICE_USDC.text);
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
    setBudget(AGENT_PRICE_USDC[modality]);
  }, [modality]);

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

  // Video generation is an async OpenRouter job (see src/lib/agents/video.ts)
  // that takes minutes to render, so a video record comes back from
  // /api/content/generate with videoStatus "pending" and a storyboard
  // placeholder as its output. Poll every ~8s for any record (in history or
  // the last-result panel) still in that state, and swap in the real video
  // URL once /api/content/video-status reports it's done. Recomputing
  // pendingIds from current state on every render means this also picks up
  // jobs that were already pending when the page loaded (e.g. a refresh
  // mid-render), not just ones submitted in this session.
  useEffect(() => {
    const pendingIds = new Set<string>();
    if (lastResult?.videoStatus === "pending") pendingIds.add(lastResult.id);
    for (const r of history) {
      if (r.videoStatus === "pending") pendingIds.add(r.id);
    }
    if (pendingIds.size === 0) return;

    const interval = setInterval(async () => {
      for (const id of pendingIds) {
        try {
          const res = await fetch(`/api/content/video-status?id=${encodeURIComponent(id)}`);
          if (!res.ok) continue;
          const update = (await res.json()) as {
            videoStatus?: ContentRecord["videoStatus"];
            output?: string;
            generationWarning?: string;
          };
          setHistory((h) => h.map((r) => (r.id === id ? { ...r, ...update } : r)));
          setLastResult((lr) => (lr && lr.id === id ? { ...lr, ...update } : lr));
        } catch {
          // Transient network hiccup — next ~8s interval tries again.
        }
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [lastResult?.id, lastResult?.videoStatus, history]);

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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // data.error is usually a string, but a failed zod validation
        // (src/app/api/content/generate/route.ts's bodySchema) returns
        // error.flatten()'s object shape instead — stringifying that with
        // `new Error(obj)` produced an unhelpful "[object Object]" alert.
        // Extract the real per-field messages when it's an object.
        const message =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.fieldErrors
              ? Object.entries(data.error.fieldErrors as Record<string, string[]>)
                  .filter(([, msgs]) => msgs?.length)
                  .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`)
                  .join("; ") || "Invalid request."
              : `Request failed (${res.status}).`;
        throw new Error(message);
      }
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
              <div>
                <label htmlFor="modality" className="mb-1 block text-xs text-muted">
                  Content type
                </label>
                <select
                  id="modality"
                  value={modality}
                  onChange={(e) => setModality(e.target.value as typeof modality)}
                  className="w-full rounded-xl border border-border-subtle bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                </select>
              </div>
              <div>
                <label htmlFor="budget" className="mb-1 block text-xs text-muted">
                  Budget (USDC) — {modality} costs {AGENT_PRICE_USDC[modality]}
                </label>
                <input
                  id="budget"
                  type="number"
                  step="0.01"
                  min={AGENT_PRICE_USDC[modality]}
                  value={budget}
                  onChange={(e) => setBudget(parseFloat(e.target.value))}
                  className="w-full rounded-xl border border-border-subtle bg-background px-3 py-2 text-sm outline-none"
                />
              </div>
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
              {lastResult.videoStatus === "pending" && (
                <p className="mt-2 flex items-center gap-2 rounded-lg border border-neon-dim/40 bg-neon/5 p-2 text-xs text-muted">
                  <Loader2 size={12} className="animate-spin" /> Video is rendering — usually a few minutes, this
                  updates automatically.
                </p>
              )}
              {lastResult.generationWarning && (
                <p className="mt-2 rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-2 text-xs text-yellow-500">
                  {lastResult.generationWarning}
                </p>
              )}
              <OutputPreview
                output={lastResult.output}
                filenameBase={`west-creatives-${lastResult.id}`}
                modalityHint={lastResult.modality}
              />
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
                  <span className="text-xs text-neon">
                    {r.videoStatus === "pending" ? (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Loader2 size={10} className="animate-spin" /> rendering
                      </span>
                    ) : (
                      `score ${r.evaluation?.score ?? "-"}`
                    )}
                  </span>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="text-xs text-muted underline hover:text-neon"
                  >
                    {expandedId === r.id ? "Hide" : "View / download"}
                  </button>
                </div>
                {expandedId === r.id && (
                  <>
                    {r.generationWarning && (
                      <p className="mt-2 rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-2 text-xs text-yellow-500">
                        {r.generationWarning}
                      </p>
                    )}
                    <OutputPreview
                      output={r.output}
                      filenameBase={`west-creatives-${r.id}`}
                      modalityHint={r.modality}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
