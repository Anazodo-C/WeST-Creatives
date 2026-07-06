import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// videoPollingUrl is server-internal (see ContentRecord.videoPollingUrl in
// src/lib/types.ts) — /api/content/video-status looks it up by record id;
// the client never needs it, so it's excluded from this column list rather
// than `SELECT *`.
const COLUMNS =
  "id, creatorId, agentId, modality, prompt, enhancedPrompt, output, evaluationJson, costUsdc, developerShareUsdc, platformShareUsdc, reputationTxHash, reputationWarning, generationWarning, videoJobId, videoStatus, createdAt";

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  const db = await getDb();
  const rows = creatorId
    ? await db.all<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM content_records WHERE creatorId = ? ORDER BY createdAt DESC`,
        [creatorId]
      )
    : await db.all<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM content_records ORDER BY createdAt DESC LIMIT 50`
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
