"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, UploadCloud, PlusCircle, Bot, Coins, FileText } from "lucide-react";
import type { AgentType, Modality } from "@/lib/types";
import { useNotifications } from "@/components/NotificationProvider";
import { OutputPreview } from "@/components/OutputPreview";
import { parseSkillFile } from "@/lib/skillParser";

interface DeveloperAgent {
  id: string;
  name: string;
  type: AgentType;
  description: string | null;
  model: string;
  capabilities: string[];
  score: number;
  transactionCount: number;
  priceUsdc: number;
  walletAddress: string | null;
  onchainAgentId: string | null;
  visibility: string;
  earnedUsdc: number;
  contentCount: number;
  createdAt: string;
}

interface DeveloperContentItem {
  id: string;
  creatorId: string;
  agentId: string;
  modality: string;
  prompt: string;
  output: string;
  costUsdc: number;
  developerShareUsdc: number;
  evaluation: { score: number };
  generationWarning?: string;
  videoStatus?: string;
  createdAt: string;
}

interface DeveloperSummary {
  agents: DeveloperAgent[];
  totalEarnedUsdc: number;
  contentCount: number;
  content: DeveloperContentItem[];
}

const AGENT_TYPES: AgentType[] = ["text", "image", "video", "audio", "editing", "custom"];

const BLANK_FORM = {
  name: "",
  description: "",
  type: "text" as AgentType,
  model: "",
  priceUsdc: "0.02",
  capabilities: "",
  nicheIndustry: "",
  modality: "unimodal" as Modality,
};

export default function DeveloperDashboard({ ownerId }: { ownerId: string }) {
  const { notify } = useNotifications();
  const [summary, setSummary] = useState<DeveloperSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [skillFileName, setSkillFileName] = useState<string | null>(null);
  const [modelWasGuessed, setModelWasGuessed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadSummary() {
    setLoading(true);
    fetch(`/api/developer/summary?developerId=${encodeURIComponent(ownerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: DeveloperSummary | null) => {
        if (d) setSummary(d);
      })
      .catch(() => {
        notify("Could not load your developer summary.", "error");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function handleSkillFile(file: File) {
    setSkillFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseSkillFile(text);
      setForm((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        description: parsed.description || prev.description,
        type: (parsed.type === "director" ? "custom" : parsed.type) as AgentType,
        model: parsed.model,
        modality: parsed.modality,
        capabilities: parsed.capabilities.join(", "),
      }));
      setModelWasGuessed(parsed.modelGuessed);
      setShowForm(true);
      notify(
        `Extracted metadata from ${file.name} — review the pre-filled fields below before registering.`,
        "info"
      );
    } catch {
      notify("Could not read that file as text — make sure it's a .md file.", "error");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const capabilities = form.capabilities
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const priceUsdc = parseFloat(form.priceUsdc);
      if (!priceUsdc || priceUsdc <= 0) throw new Error("Price must be a positive number.");

      const res = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          developerId: ownerId,
          description: form.description || form.name,
          type: form.type,
          capabilities,
          model: form.model,
          nicheIndustry: form.nicheIndustry || undefined,
          modality: form.modality,
          scope: "specialized",
          generationParadigm: "auto-regressive",
          priceUsdc,
          visibility: "public",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.fieldErrors
              ? Object.entries(data.error.fieldErrors as Record<string, string[]>)
                  .filter(([, msgs]) => msgs?.length)
                  .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`)
                  .join("; ") || "Invalid request."
              : `Registration failed (${res.status}).`;
        throw new Error(message);
      }

      notify(`Agent "${form.name}" registered.${data.warning ? ` (${data.warning})` : ""}`, "success");
      setForm(BLANK_FORM);
      setSkillFileName(null);
      setShowForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadSummary();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not register agent.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !summary) {
    return (
      <div className="mt-10 flex items-center justify-center gap-2 text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading your developer summary…
      </div>
    );
  }

  const data = summary ?? { agents: [], totalEarnedUsdc: 0, contentCount: 0, content: [] };

  return (
    <>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div className="neon-border rounded-2xl bg-surface p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Coins size={16} className="text-neon" /> Total earned
          </div>
          <div className="mt-2 text-3xl font-extrabold text-neon">{data.totalEarnedUsdc} USDC</div>
          <div className="mt-1 text-xs text-muted">90% developer share across all your agents</div>
        </div>
        <div className="neon-border rounded-2xl bg-surface p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot size={16} className="text-neon" /> Agents
          </div>
          <div className="mt-2 text-3xl font-extrabold text-neon">{data.agents.length}</div>
          <div className="mt-1 text-xs text-muted">registered to your developer account</div>
        </div>
        <div className="neon-border rounded-2xl bg-surface p-5">
          <div className="text-sm font-semibold">Content produced</div>
          <div className="mt-2 text-3xl font-extrabold text-neon">{data.contentCount}</div>
          <div className="mt-1 text-xs text-muted">generations fulfilled by your agents</div>
        </div>
      </div>

      <div className="mt-10 neon-border rounded-2xl bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Your agents</h2>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-full bg-neon px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
          >
            <PlusCircle size={14} /> Register agent
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleRegister} className="mt-4 space-y-3 rounded-xl border border-border-subtle bg-background p-4">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                <UploadCloud size={12} /> Upload a skill.md (optional — pre-fills the fields below)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSkillFile(file);
                }}
                className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-neon/10 file:px-3 file:py-1.5 file:text-xs file:text-neon"
              />
              {skillFileName && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                  <FileText size={11} /> Extracted from {skillFileName}
                  {modelWasGuessed && " — model wasn't stated in the file, defaulted by content type; double-check it."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Agent name"
                className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AgentType })}
                className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              >
                {AGENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                required
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="Model (e.g. google/gemini-2.5-flash-lite)"
                className="col-span-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description"
                rows={2}
                className="col-span-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              />
              <input
                value={form.capabilities}
                onChange={(e) => setForm({ ...form, capabilities: e.target.value })}
                placeholder="Capabilities (comma-separated)"
                className="col-span-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              />
              <input
                value={form.nicheIndustry}
                onChange={(e) => setForm({ ...form, nicheIndustry: e.target.value })}
                placeholder="Niche / industry"
                className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              />
              <input
                required
                type="number"
                step="0.001"
                min="0.001"
                value={form.priceUsdc}
                onChange={(e) => setForm({ ...form, priceUsdc: e.target.value })}
                placeholder="Price (USDC)"
                className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Registering..." : "Register agent"}
            </button>
          </form>
        )}

        <div className="mt-4 overflow-x-auto">
          {data.agents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No agents yet — register your first one above.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="pb-2">Agent</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Model</th>
                  <th className="pb-2">Score</th>
                  <th className="pb-2">Requests</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">Earned</th>
                  <th className="pb-2">Identity</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.id} className="border-t border-border-subtle">
                    <td className="py-2.5 font-medium">{a.name}</td>
                    <td className="py-2.5 capitalize text-muted">{a.type}</td>
                    <td className="py-2.5 text-muted">
                      <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">{a.model}</span>
                    </td>
                    <td className="py-2.5 text-neon">{a.score}</td>
                    <td className="py-2.5 text-muted">{a.contentCount}</td>
                    <td className="py-2.5 text-muted">{a.priceUsdc}</td>
                    <td className="py-2.5 text-neon">{a.earnedUsdc}</td>
                    <td className="py-2.5">
                      {a.onchainAgentId ? (
                        <span className="rounded-full bg-neon/10 px-2 py-0.5 text-[10px] text-neon">onchain</span>
                      ) : (
                        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted">local</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-10 neon-border rounded-2xl bg-surface p-6">
        <h2 className="font-bold">Content your agents have produced</h2>
        <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-1">
          {data.content.length === 0 && <p className="text-sm text-muted">Nothing produced yet.</p>}
          {data.content.map((r) => {
            const agent = data.agents.find((a) => a.id === r.agentId);
            return (
              <div key={r.id} className="rounded-xl border border-border-subtle bg-background p-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="capitalize">
                    {r.modality} {agent && `· ${agent.name}`}
                  </span>
                  <span>+{r.developerShareUsdc} USDC</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{r.prompt}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-neon">score {r.evaluation?.score ?? "-"}</span>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="text-xs text-muted underline hover:text-neon"
                  >
                    {expandedId === r.id ? "Hide" : "View"}
                  </button>
                </div>
                {expandedId === r.id && (
                  <>
                    <p className="mt-2 text-xs text-muted">
                      For creator: <span className="text-foreground">{r.creatorId}</span>
                    </p>
                    {r.generationWarning && (
                      <p className="mt-2 rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-2 text-xs text-yellow-500">
                        {r.generationWarning}
                      </p>
                    )}
                    <OutputPreview output={r.output} filenameBase={`agent-output-${r.id}`} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
