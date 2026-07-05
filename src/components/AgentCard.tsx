import type { AgentMetadata } from "@/lib/types";
import { Sparkles } from "lucide-react";

export default function AgentCard({ agent }: { agent: AgentMetadata }) {
  return (
    <div className="neon-border rounded-2xl bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm uppercase tracking-wide text-muted">{agent.type}</div>
          <h3 className="mt-1 text-lg font-bold">{agent.name}</h3>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-neon-dim bg-neon/10 px-2 py-1 text-xs text-neon">
          <Sparkles size={12} />
          {agent.score}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">{agent.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.capabilities.slice(0, 4).map((c) => (
          <span
            key={c}
            className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-muted"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-4 text-sm">
        <div className="text-muted">
          <span className="text-foreground font-semibold">{agent.transactionCount}</span> txns
        </div>
        <div className="font-semibold text-neon">{agent.priceUsdc} USDC / req</div>
      </div>
    </div>
  );
}
