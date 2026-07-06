/**
 * Autonomous agent scouting: given every candidate sub-agent for each
 * requested content type and a total budget, decides which single agent per
 * modality to hire — the actual "director scouts the marketplace and picks
 * the best it can afford" behavior, rather than always hiring the one
 * highest-score agent regardless of price (the previous behavior, back when
 * there was only one agent per modality anyway).
 *
 * With 2-3 candidates per modality and up to 4 modalities requested at once,
 * the full combination space is at most 3^4 = 81 — small enough to brute
 * force directly (enumerate every combination, keep the best affordable one)
 * instead of a knapsack DP. That also makes the decision trivially
 * explainable for a demo: "N combinations evaluated, this one won."
 */
import type { ContentModality } from "@/lib/types";

export interface CandidateAgent {
  id: string;
  name: string;
  model: string;
  priceUsdc: number;
  score: number;
  walletAddress: string | null;
  onchainAgentId: string | null;
}

export interface ScoutSelection {
  modality: ContentModality;
  agent: CandidateAgent;
}

export interface ScoutResult {
  selections: ScoutSelection[];
  totalCost: number;
  totalScore: number;
  combinationsEvaluated: number;
  /** false when even the cheapest possible combination exceeds budgetUsdc —
   * callers should treat this as a hard "budget too low" error, same as the
   * previous flat-price check did. */
  withinBudget: boolean;
}

/**
 * Brute-forces every one-agent-per-modality combination and returns the
 * highest-combined-score combination whose combined price fits budgetUsdc.
 * Ties break toward the cheaper combination, so equal-quality picks don't
 * burn budget for no reason. Throws if any requested modality has zero
 * candidates at all (a real configuration error, not a budget problem).
 */
export function scoutAgents(
  candidatesByModality: Partial<Record<ContentModality, CandidateAgent[]>>,
  modalities: ContentModality[],
  budgetUsdc: number
): ScoutResult {
  const lists = modalities.map((m) => {
    const candidates = candidatesByModality[m];
    if (!candidates || candidates.length === 0) {
      throw new Error(`No agent available for modality ${m}`);
    }
    return { modality: m, candidates };
  });

  // Cartesian product over each modality's candidate list.
  let combos: ScoutSelection[][] = [[]];
  for (const { modality, candidates } of lists) {
    const next: ScoutSelection[][] = [];
    for (const combo of combos) {
      for (const agent of candidates) {
        next.push([...combo, { modality, agent }]);
      }
    }
    combos = next;
  }

  const scored = combos.map((selections) => ({
    selections,
    totalCost: +selections.reduce((sum, s) => sum + s.agent.priceUsdc, 0).toFixed(6),
    totalScore: selections.reduce((sum, s) => sum + s.agent.score, 0),
  }));

  const affordable = scored.filter((c) => c.totalCost <= budgetUsdc);

  if (affordable.length > 0) {
    affordable.sort((a, b) => b.totalScore - a.totalScore || a.totalCost - b.totalCost);
    return { ...affordable[0], combinationsEvaluated: combos.length, withinBudget: true };
  }

  // Nothing fits — surface the cheapest possible combination so the caller
  // can report exactly what the real minimum cost is.
  scored.sort((a, b) => a.totalCost - b.totalCost);
  return { ...scored[0], combinationsEvaluated: combos.length, withinBudget: false };
}

export interface BudgetRangeEntry {
  modality: ContentModality;
  cheapest: number;
  priciest: number;
  agentCount: number;
}

export interface BudgetRange {
  min: number;
  max: number;
  perModality: BudgetRangeEntry[];
}

/**
 * Recommends a budget range for a set of desired content types — the
 * cheapest-possible-combo total to the priciest-possible-combo total across
 * their real registered agents. Lets the dashboard suggest "$X-$Y" the
 * moment content types are picked, before the creator has typed a budget.
 */
export function recommendBudgetRange(
  candidatesByModality: Partial<Record<ContentModality, CandidateAgent[]>>,
  modalities: ContentModality[]
): BudgetRange {
  const perModality: BudgetRangeEntry[] = modalities.map((m) => {
    const candidates = candidatesByModality[m] ?? [];
    const prices = candidates.map((c) => c.priceUsdc);
    return {
      modality: m,
      cheapest: prices.length ? Math.min(...prices) : 0,
      priciest: prices.length ? Math.max(...prices) : 0,
      agentCount: candidates.length,
    };
  });

  return {
    min: +perModality.reduce((sum, p) => sum + p.cheapest, 0).toFixed(6),
    max: +perModality.reduce((sum, p) => sum + p.priciest, 0).toFixed(6),
    perModality,
  };
}
