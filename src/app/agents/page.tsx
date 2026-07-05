"use client";

import { useEffect, useState } from "react";
import AgentCard from "@/components/AgentCard";
import type { AgentMetadata } from "@/lib/types";
import { Search } from "lucide-react";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents/list")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .finally(() => setLoading(false));
  }, []);

  const types = ["all", "director", "image", "video", "audio", "text", "editing", "custom"];

  const filtered = agents.filter((a) => {
    const matchesType = typeFilter === "all" || a.type === typeFilter;
    const matchesQuery =
      !query ||
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.description.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Agents</h1>
      <p className="mt-2 text-muted">
        Metadata, score, and records for every agent in the marketplace.
      </p>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 py-2 text-sm md:w-80">
          <Search size={14} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full border px-3 py-1.5 text-xs capitalize transition-colors ${
                typeFilter === t
                  ? "border-neon-dim bg-neon/10 text-neon"
                  : "border-border-subtle text-muted hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-16 text-center text-muted">Loading agents…</div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
