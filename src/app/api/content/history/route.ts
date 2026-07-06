import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// videoPollingUrl is server-internal (see ContentRecord.videoPollingUrl in
// src/lib/types.ts) — /api/content/video-status looks it up by record id;
// the client never needs it, so it's excluded from this column list rather
// than `SELECT *`. Prefixed with `r.` since this now joins against agents
// to surface which agent/model actually produced each record (see
// src/lib/agents/director.ts's scoutAgents — multiple agents per modality
// now genuinely differ in model/price, so the dashboard needs to show which
// one was picked, not just assume there's only one).
const COLUMNS =
  "r.id, r.creatorId, r.agentId, r.modality, r.batchId, r.prompt, r.enhancedPrompt, r.output, r.evaluationJson, r.costUsdc, r.developerShareUsdc, r.platformShareUsdc, r.reputationTxHash, r.reputationWarning, r.generationWarning, r.videoJobId, r.videoStatus, r.reserveDebitTxHash, r.reserveDebitWarning, r.createdAt, a.name AS agentName, a.model AS agentModel";

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  const db = await getDb();
  const rows = creatorId
    ? await db.all<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM content_records r LEFT JOIN agents a ON a.id = r.agentId WHERE r.creatorId = ? ORDER BY r.createdAt DESC`,
        [creatorId]
      )
    : await db.all<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM content_records r LEFT JOIN agents a ON a.id = r.agentId ORDER BY r.createdAt DESC LIMIT 50`
      );

  // The DB column is evaluationJson (a serialized string, see db.ts) but
  // ContentRecord.evaluation (src/lib/types.ts) is the parsed object the
  // dashboard actually reads (r.evaluation.score) — this was previously
  // returned as the raw string under the wrong key, so every history item's
  // score silently rendered as "-".
  const records = rows.map(({ evaluationJson, ...rest }) => ({
    ...rest,
    evaluation: (() => {
      try {
        return JSON.parse(evaluationJson as string);
      } catch {
        return { score: 0, passed: false, radar: {}, feedback: "", failureType: "none" };
      }
    })(),
  }));

  return NextResponse.json({ records });
}
