"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Wallet, Chrome, Loader2 } from "lucide-react";

/**
 * Parse a fetch Response as JSON, raising a clear Error instead of the raw
 * "Unexpected end of JSON input" browser message when the body is empty or
 * not JSON (e.g. a non-API-route 500 page, or a network hiccup) — this is
 * also defense-in-depth now that both API routes below always return JSON
 * even on their own internal errors.
 */
async function parseJson(res: Response, label: string) {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned an unreadable response (status ${res.status}).`);
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `${label} failed (status ${res.status}).`;
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

async function provisionAccount(params: {
  ownerId: string;
  role: "creator" | "developer";
  name: string;
  industry?: string;
}) {
  const walletRes = await fetch("/api/wallets/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerId: params.ownerId, label: `${params.role}-${params.name}` }),
  });
  const wallet = await parseJson(walletRes, "Wallet creation");

  let agentName: string | undefined;
  if (params.role === "creator") {
    // Every creator gets a personal director agent, but it's marked
    // "personal" so it never shows up in the public /agents marketplace —
    // the only director agent listed there is the shared guest/demo one.
    const agentRes = await fetch("/api/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${params.name}'s Agent`,
        developerId: params.ownerId,
        description: `Personal director agent for ${params.name}, scouting and optimizing budgeted resources.`,
        type: "director",
        capabilities: ["scouting", "budget-optimization"],
        model: "claude-orchestrator-v1",
        nicheIndustry: params.industry || undefined,
        modality: "multi-modal",
        scope: "general",
        generationParadigm: "auto-regressive",
        priceUsdc: 0.01,
        visibility: "personal",
      }),
    });
    await parseJson(agentRes, "Agent registration");
    agentName = `${params.name}'s Agent`;
  }

  localStorage.setItem("vibe.ownerId", params.ownerId);
  localStorage.setItem("vibe.role", params.role);

  return { address: wallet.address as string, agentName };
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const initialRole = params.get("role") === "developer" ? "developer" : "creator";

  const [role, setRole] = useState<"creator" | "developer">(initialRole);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [result, setResult] = useState<{ address: string; agentName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Once Google sign-in completes, provision this identity automatically
  // (skip if we've already done it for this exact email in this browser).
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const ownerId = `google-${session.user.email}`;
    if (localStorage.getItem("vibe.ownerId") === ownerId) {
      router.push("/dashboard");
      return;
    }

    setGoogleLoading(true);
    setError(null);
    provisionAccount({
      ownerId,
      role,
      name: session.user.name ?? session.user.email,
      industry,
    })
      .then((r) => {
        setResult(r);
        setTimeout(() => router.push("/dashboard"), 1200);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setGoogleLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.email]);

  // Connecting a wallet only auto-redirects a *returning* owner (already
  // provisioned on this browser, same address) straight to their dashboard.
  // For a new wallet, we deliberately do NOT auto-provision here anymore —
  // that used to fire immediately on connect with a placeholder name before
  // the person ever got a chance to type one in. Now connecting just
  // confirms the address; the account (with their chosen name/role) is
  // created when they submit the form below.
  useEffect(() => {
    if (!isConnected || !address) return;
    const ownerId = `wallet-${address}`;
    if (localStorage.getItem("vibe.ownerId") === ownerId) {
      router.push("/dashboard");
    }
  }, [isConnected, address, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setWalletLoading(isConnected);
    setError(null);
    try {
      const ownerId =
        isConnected && address
          ? `wallet-${address}`
          : `${role}-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const r = await provisionAccount({ ownerId, role, name, industry });
      setResult(r);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setWalletLoading(false);
    }
  }

  const busy = loading || googleLoading || walletLoading;

  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-3xl font-extrabold">Create your account</h1>
      <p className="mt-2 text-muted">Choose which side of the marketplace you&apos;re on.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {(["creator", "developer"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              role === r
                ? "border-neon-dim bg-neon/10"
                : "border-border-subtle bg-surface hover:border-neon-dim"
            }`}
          >
            <div className="font-semibold capitalize">{r}</div>
            <div className="mt-1 text-xs text-muted">
              {r === "creator"
                ? "Hire agents to create content for you"
                : "Build agents creators hire"}
            </div>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="text-sm text-muted">
            {role === "creator" ? "Name your agent's owner (you)" : "Developer name"}
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-4 py-2.5 outline-none focus:border-neon-dim"
            placeholder="e.g. Zodo"
          />
        </div>

        {role === "creator" && (
          <div>
            <label className="text-sm text-muted">Industry / niche</label>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-4 py-2.5 outline-none focus:border-neon-dim"
              placeholder="e.g. fintech, skincare, gaming"
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy || isConnected}
            onClick={() => openConnectModal?.()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface py-2.5 text-sm hover:border-neon-dim disabled:opacity-50"
          >
            <Wallet size={16} className={isConnected ? "text-neon" : undefined} />
            {isConnected && address
              ? `${address.slice(0, 6)}...${address.slice(-4)}`
              : "Connect wallet"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => signIn("google", { callbackUrl: "/signup" })}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface py-2.5 text-sm hover:border-neon-dim disabled:opacity-50"
          >
            {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <Chrome size={16} />}
            Google
          </button>
        </div>

        {isConnected && (
          <p className="text-xs text-muted">
            Wallet connected — name your {role === "creator" ? "agent" : "developer profile"} above,
            then create your account below.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !name}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon py-3 font-semibold text-black disabled:opacity-50"
        >
          {(loading || walletLoading) && <Loader2 size={16} className="animate-spin" />}
          {loading || walletLoading ? "Setting up..." : "Create account"}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-xl border border-neon-dim bg-neon/5 p-4 text-sm">
          <div className="text-neon">Wallet created: {result.address}</div>
          {result.agentName && <div className="mt-1 text-muted">Agent: {result.agentName}</div>}
          <div className="mt-1 text-muted">Redirecting to your dashboard…</div>
        </div>
      )}
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
