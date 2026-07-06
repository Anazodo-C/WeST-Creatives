"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Save } from "lucide-react";
import type { ContentRecord, ContentModality } from "@/lib/types";
import { AGENT_PRICE_USDC } from "@/lib/pricing";
import { useNotifications } from "@/components/NotificationProvider";
import { OutputPreview } from "@/components/OutputPreview";

const ALL_MODALITIES: ContentModality[] = ["text", "image", "video", "audio"];

interface BudgetRangeEntry {
  modality: ContentModality;
  cheapest: number;
  priciest: number;
  agentCount: number;
}

interface BudgetRange {
  min: number;
  max: number;
  perModality: BudgetRangeEntry[];
}

/** The director's autonomous hiring decision for the most recent submission
 * — which agent it scouted and hired per modality, and how many
 * agent-combinations it evaluated to get there. Surfaced so the "director
 * scouts the marketplace and picks the best it can afford" behavior is
 * actually visible, not just its output. */
interface ScoutSummary {
  combinationsEvaluated: number;
  selections: {
    modality: ContentModality;
    agentId: string;
    agentName: string;
    model: string;
    priceUsdc: number;
    score: number;
  }[];
}

const BLANK_BRAND = {
  name: "",
  industry: "",
  targetAudience: "",
  goal: "",
  emotion: "",
  colors: "",
  voiceProfile: "",
  stylePrefix: "",
};

export default function CreatorDashboard({ ownerId }: { ownerId: string }) {
  const { notify } = useNotifications();
  const [history, setHistory] = useState<ContentRecord[]>([]);
  const [prompt, setPrompt] = useState("");
  // One prompt can fan out to several content types at once (e.g. "write a
  // caption and make an image ad") — the director enhances the prompt once
  // and hires a sub-agent per selected type (see runMultiDirector). At
  // least one must always stay selected; toggleModality below enforces that.
  const [modalities, setModalities] = useState<ContentModality[]>(["text"]);
  function toggleModality(m: ContentModality) {
    setModalities((prev) => {
      if (prev.includes(m)) {
        return prev.length > 1 ? prev.filter((x) => x !== m) : prev;
      }
      return [...prev, m];
    });
  }
  // Defaults to the sum of the selected content types' actual nanopayment
  // cost (src/lib/pricing.ts) rather than an arbitrary flat guess, and
  // re-syncs whenever the selection changes (see the effect below) — still
  // fully editable, this is just a sane starting point so the very first
  // submit doesn't fail with "Budget too low" for no obvious reason.
  const [budget, setBudget] = useState(AGENT_PRICE_USDC.text);
  // Real recommended range from the marketplace's actual registered agents
  // (see /api/content/budget-recommendation + scoutAgents in
  // src/lib/agents/scout.ts) — replaces the flat AGENT_PRICE_USDC guess the
  // moment it loads; null until the first fetch resolves (or if it fails,
  // in which case the flat guess below is still shown as a fallback).
  const [budgetRange, setBudgetRange] = useState<BudgetRange | null>(null);
  // The director's most recent autonomous hiring decision — which agent it
  // scouted and hired per modality for the batch currently shown in
  // lastBatch below.
  const [scoutSummary, setScoutSummary] = useState<ScoutSummary | null>(null);
  const [brand, setBrand] = useState(BLANK_BRAND);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Every submission produces a batch of one or more records (one per
  // selected content type, all sharing a batchId) — see runMultiDirector.
  const [lastBatch, setLastBatch] = useState<ContentRecord[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load this creator's saved brand profile (src/app/api/brand/route.ts —
  // backed by the previously-unused brand_profiles table) once, and prefill
  // the form with it instead of starting blank every session.
  useEffect(() => {
    fetch(`/api/brand?ownerId=${encodeURIComponent(ownerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { profile: Record<string, unknown> | null } | null) => {
        const p = d?.profile;
        if (p) {
          setBrand({
            name: (p.name as string) ?? "",
            industry: (p.industry as string) ?? "",
            targetAudience: (p.targetAudience as string) ?? "",
            goal: (p.goal as string) ?? "",
            emotion: (p.emotion as string) ?? "",
            colors: Array.isArray(p.colors) ? (p.colors as string[]).join(", ") : "",
            voiceProfile: (p.voiceProfile as string) ?? "",
            stylePrefix: (p.stylePrefix as string) ?? "",
          });
        }
      })
      .catch(() => {
        // Non-critical — brand fields just stay blank/editable as before.
      })
      .finally(() => setBrandLoaded(true));
  }, [ownerId]);

  async function saveBrandProfile() {
    setBrandSaving(true);
    try {
      const res = await fetch("/api/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId,
          ...brand,
          colors: brand.colors ? brand.colors.split(",").map((c) => c.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status}).`);
      notify("Brand profile saved.", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save brand profile.", "error");
    } finally {
      setBrandSaving(false);
    }
  }

  useEffect(() => {
    fetch(`/api/content/history?creatorId=${encodeURIComponent(ownerId)}`)
      .then((res) => res.json())
      .then((d) => setHistory(d.records ?? []));
  }, [ownerId]);

  useEffect(() => {
    // Flat-guess fallback so the field is never empty/zero while the real
    // range is loading (or if the fetch below fails).
    setBudget(+modalities.reduce((sum, m) => sum + AGENT_PRICE_USDC[m], 0).toFixed(6));

    let cancelled = false;
    fetch(`/api/content/budget-recommendation?modalities=${modalities.join(",")}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((range: BudgetRange | null) => {
        if (cancelled || !range) return;
        setBudgetRange(range);
        // Default the field to the recommended minimum — the cheapest
        // combination of real agents that can fulfill this request — rather
        // than the old flat per-modality guess, which didn't reflect that
        // some modalities now have multiple agents at different prices.
        setBudget(range.min);
      })
      .catch(() => {
        // Non-critical — the flat guess above stays as the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [modalities]);

  // Video generation is an async OpenRouter job (see src/lib/agents/video.ts)
  // that takes minutes to render, so a video record comes back from
  // /api/content/generate with videoStatus "pending" and a storyboard
  // placeholder as its output. Poll every ~8s for any record (in history or
  // the last-batch panel) still in that state, and swap in the real video
  // URL once /api/content/video-status reports it's done. Recomputing
  // pendingIds from current state on every render means this also picks up
  // jobs that were already pending when the page loaded (e.g. a refresh
  // mid-render), not just ones submitted in this session.
  const lastBatchPendingKey = lastBatch?.filter((r) => r.videoStatus === "pending").map((r) => r.id).join(",");
  useEffect(() => {
    const pendingIds = new Set<string>();
    for (const r of lastBatch ?? []) {
      if (r.videoStatus === "pending") pendingIds.add(r.id);
    }
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
          setLastBatch((batch) => batch?.map((r) => (r.id === id ? { ...r, ...update } : r)) ?? batch);
        } catch {
          // Transient network hiccup — next ~8s interval tries again.
        }
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [lastBatchPendingKey, history]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          modalities,
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
      const records: ContentRecord[] = data.records ?? [];
      setLastBatch(records);
      setHistory((h) => [...records, ...h]);
      setScoutSummary(data.scoutSummary ?? null);
      notify(`Generated ${records.length} output${records.length === 1 ? "" : "s"}.`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div className="neon-border rounded-2xl bg-surface p-5 md:col-span-3">
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
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Content type(s)</span>
                <span>Select more than one to get multiple outputs from one prompt</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ALL_MODALITIES.map((m) => {
                  const checked = modalities.includes(m);
                  // Real per-modality range from the marketplace's registered
                  // agents (multiple agents per modality now genuinely cost
                  // different amounts) — falls back to the flat pricing.ts
                  // guess until the range has loaded.
                  const entry = budgetRange?.perModality.find((p) => p.modality === m);
                  const priceLabel = entry
                    ? entry.cheapest === entry.priciest
                      ? `${entry.cheapest}`
                      : `${entry.cheapest}-${entry.priciest}`
                    : `${AGENT_PRICE_USDC[m]}`;
                  return (
                    <label
                      key={m}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs capitalize transition-colors ${
                        checked
                          ? "border-neon bg-neon/10 text-neon"
                          : "border-border-subtle bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModality(m)}
                        className="sr-only"
                      />
                      {m} <span className="text-[10px] opacity-70">({priceLabel})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="budget" className="mb-1 block text-xs text-muted">
                Budget (USDC) — {modalities.join(" + ")} recommended{" "}
                {budgetRange
                  ? budgetRange.min === budgetRange.max
                    ? `${budgetRange.min} total`
                    : `${budgetRange.min}-${budgetRange.max} total`
                  : `${+modalities.reduce((sum, m) => sum + AGENT_PRICE_USDC[m], 0).toFixed(6)} total`}
              </label>
              <input
                id="budget"
                type="number"
                step="0.01"
                min={budgetRange?.min ?? +modalities.reduce((sum, m) => sum + AGENT_PRICE_USDC[m], 0).toFixed(6)}
                value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value))}
                className="w-full rounded-xl border border-border-subtle bg-background px-3 py-2 text-sm outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">
                Higher budgets let the director hire pricier, higher-scoring agents where available — it always
                scouts the best combination your budget affords.
              </p>
            </div>

            <details className="rounded-xl border border-border-subtle bg-background p-3 text-sm" open={brandLoaded && !!brand.name}>
              <summary className="cursor-pointer text-muted">
                Brand data {brand.name ? `— ${brand.name}` : "(optional)"}
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["name", "industry", "targetAudience", "goal", "emotion", "colors", "voiceProfile", "stylePrefix"] as const).map(
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
              <button
                type="button"
                onClick={saveBrandProfile}
                disabled={brandSaving}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs text-muted hover:text-neon disabled:opacity-50"
              >
                {brandSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save brand profile
              </button>
              <p className="mt-1.5 text-[10px] text-muted">
                Saved profiles are remembered across sessions and prefill this form next time.
              </p>
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

          {lastBatch && lastBatch.length > 0 && (
            <div className="mt-4 space-y-3">
              {lastBatch.length > 1 && (
                <p className="text-xs text-muted">
                  {lastBatch.length} outputs generated from this brief:
                </p>
              )}
              {scoutSummary && (
                <p className="rounded-lg border border-border-subtle bg-background p-2 text-[11px] text-muted">
                  Director evaluated {scoutSummary.combinationsEvaluated} agent combination
                  {scoutSummary.combinationsEvaluated === 1 ? "" : "s"} within budget and hired:{" "}
                  {scoutSummary.selections
                    .map((s) => `${s.agentName} for ${s.modality} (score ${s.score}, ${s.priceUsdc} USDC)`)
                    .join("; ")}
                  .
                </p>
              )}
              {lastBatch.map((record) => (
                <div key={record.id} className="rounded-xl border border-neon-dim bg-neon/5 p-4 text-sm">
                  {lastBatch.length > 1 && (
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neon">
                      {record.modality}
                    </div>
                  )}
                  {record.agentName && (
                    <div className="mb-1 text-xs text-muted">
                      Hired <span className="text-foreground">{record.agentName}</span> ({record.agentModel})
                    </div>
                  )}
                  <div className="text-muted">Evaluation score</div>
                  <div className="text-2xl font-bold text-neon">{record.evaluation.score}/100</div>
                  <p className="mt-1 text-xs text-muted">
                    Production cost: <span className="text-foreground">{record.costUsdc} USDC</span>
                    {typeof record.developerShareUsdc === "number" &&
                      typeof record.platformShareUsdc === "number" && (
                        <>
                          {" "}
                          ({record.developerShareUsdc} to the agent's developer, {record.platformShareUsdc}{" "}
                          platform fee)
                        </>
                      )}
                  </p>
                  {record.reserveDebitTxHash && (
                    <p className="mt-1 text-[11px] text-muted">
                      Refill-reserve debit: {record.costUsdc} testnet USDC → platform wallet (simulates the
                      future mainnet OpenRouter refill)
                    </p>
                  )}
                  {record.videoStatus === "pending" && (
                    <p className="mt-2 flex items-center gap-2 rounded-lg border border-neon-dim/40 bg-neon/5 p-2 text-xs text-muted">
                      <Loader2 size={12} className="animate-spin" /> Video is rendering — usually a few minutes,
                      this updates automatically.
                    </p>
                  )}
                  {record.generationWarning && (
                    <p className="mt-2 rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-2 text-xs text-yellow-500">
                      {record.generationWarning}
                    </p>
                  )}
                  <OutputPreview
                    output={record.output}
                    filenameBase={`west-creatives-${record.id}`}
                    modalityHint={record.modality}
                  />
                </div>
              ))}
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
                    {r.agentName && (
                      <p className="mt-2 text-xs text-muted">
                        Hired <span className="text-foreground">{r.agentName}</span> ({r.agentModel})
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      Production cost: <span className="text-foreground">{r.costUsdc} USDC</span>
                      {typeof r.developerShareUsdc === "number" && typeof r.platformShareUsdc === "number" && (
                        <> ({r.developerShareUsdc} to the agent's developer, {r.platformShareUsdc} platform fee)</>
                      )}
                    </p>
                    {r.reserveDebitTxHash && (
                      <p className="mt-1 text-[11px] text-muted">
                        Refill-reserve debit: {r.costUsdc} testnet USDC → platform wallet
                      </p>
                    )}
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
    </>
  );
}
