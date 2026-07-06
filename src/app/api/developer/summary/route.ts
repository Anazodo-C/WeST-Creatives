import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Everything a developer needs to see about their own agents: the agents
 * themselves (with their live marketplace metrics), how much USDC they've
 * earned across all of them, and a feed of content those agents have
 * produced for creators — the developer-facing counterpart to
 * /api/content/history (which is creator-facing: "what have I generated").
 *
 * GET /api/developer/summary?developerId=...
 */
export async function GET(req: NextRequest) {
  const developerId = req.nextUrl.searchParams.get("developerId");
  if (!developerId) {
    return NextResponse.json({ error: "developerId is required" }, { status: 400 });
  }

  try {
    const db = await getDb();

    const agents = await db.all<Record<string, unknown>>(
      `SELECT id, name, type, description, model, capabilities, score, transactionCount, priceUsdc, walletAddress, onchainAgentId, visibility, createdAt
       FROM agents WHERE developerId = ? ORDER BY createdAt DESC`,
      [developerId]
    );

    const agentIds = agents.map((a) => a.id as string);

    // No agents yet — a brand-new developer account — return an empty but
    // well-shaped response instead of erroring on the IN () queries below.
    if (agentIds.length === 0) {
      return NextResponse.json({
        agents: [],
        totalEarnedUsdc: 0,
        contentCount: 0,
        content: [],
      });
    }

    const placeholders = agentIds.map(() => "?").join(",");

    const earnings = await db.get<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(developerShareUsdc),0) as total, COUNT(*) as count FROM content_records WHERE agentId IN (${placeholders})`,
      agentIds
    );

    // Per-agent breakdown so the developer can see which agent is actually
    // earning, not just a lump total.
    const perAgentEarnings = await db.all<{ agentId: string; total: number; count: number }>(
      `SELECT agentId, COALESCE(SUM(developerShareUsdc),0) as total, COUNT(*) as count
       FROM content_records WHERE agentId IN (${placeholders}) GROUP BY agentId`,
      agentIds
    );
    const earningsByAgent = new Map(perAgentEarnings.map((r) => [r.agentId, r]));

    const content = await db.all<Record<string, unknown>>(
      `SELECT id, creatorId, agentId, modality, prompt, output, costUsdc, developerShareUsdc, evaluationJson, generationWarning, videoStatus, createdAt
       FROM content_records WHERE agentId IN (${placeholders}) ORDER BY createdAt DESC LIMIT 50`,
      agentIds
    );

    return NextResponse.json({
      agents: agents.map((a) => {
        const e = earningsByAgent.get(a.id as string);
        return {
          ...a,
          capabilities: a.capabilities ? JSON.parse(a.capabilities as string) : [],
          earnedUsdc: e ? +e.total.toFixed(6) : 0,
          contentCount: e?.count ?? 0,
        };
      }),
      totalEarnedUsdc: +(earnings?.total ?? 0).toFixed(6),
      contentCount: earnings?.count ?? 0,
      content: content.map(({ evaluationJson, ...rest }) => ({
        ...rest,
        evaluation: (() => {
          try {
            return JSON.parse(evaluationJson as string);
          } catch {
            return { score: 0, passed: false, radar: {}, feedback: "", failureType: "none" };
          }
        })(),
      })),
    });
  } catch (err) {
    console.error("[developer/summary] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load developer summary." },
      { status: 500 }
    );
  }
}
