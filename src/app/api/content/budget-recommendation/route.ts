import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recommendBudgetRange, type CandidateAgent } from "@/lib/agents/scout";
import type { ContentModality } from "@/lib/types";

const VALID_MODALITIES: ContentModality[] = ["text", "image", "video", "audio"];

type AgentRow = {
  id: string;
  name: string;
  model: string;
  priceUsdc: number;
  score: number;
  walletAddress: string | null;
  onchainAgentId: string | null;
};

/**
 * Recommends a budget range for a chosen set of content types, based on the
 * real registered agents for each — the cheapest-possible-combo total to
 * the priciest-possible-combo total (see recommendBudgetRange in
 * src/lib/agents/scout.ts). Lets the dashboard show "$X-$Y recommended"
 * as soon as content types are picked, instead of a single flat guess from
 * src/lib/pricing.ts's static per-modality constants.
 *
 * GET /api/content/budget-recommendation?modalities=text,image
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("modalities");
  if (!raw) {
    return NextResponse.json({ error: "Missing modalities query param, e.g. ?modalities=text,image" }, { status: 400 });
  }

  const modalities = raw
    .split(",")
    .map((m) => m.trim())
    .filter((m): m is ContentModality => VALID_MODALITIES.includes(m as ContentModality));

  if (modalities.length === 0) {
    return NextResponse.json({ error: "No valid modalities provided." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const entries = await Promise.all(
      modalities.map(async (m) => {
        const rows = await db.all<AgentRow>(
          "SELECT id, name, model, priceUsdc, score, walletAddress, onchainAgentId FROM agents WHERE type = ? AND visibility = 'public' ORDER BY score DESC",
          [m]
        );
        const candidates: CandidateAgent[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          model: r.model,
          priceUsdc: r.priceUsdc,
          score: r.score,
          walletAddress: r.walletAddress,
          onchainAgentId: r.onchainAgentId,
        }));
        return [m, candidates] as const;
      })
    );

    const candidatesByModality = Object.fromEntries(entries) as Partial<Record<ContentModality, CandidateAgent[]>>;
    const range = recommendBudgetRange(candidatesByModality, modalities);
    return NextResponse.json(range);
  } catch (err) {
    console.error("[content/budget-recommendation] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not compute a budget recommendation." },
      { status: 500 }
    );
  }
}
