import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { runDirector } from "@/lib/agents/director";
import { settlePaymentSplit, giveFeedback } from "@/lib/circle";
import { getOrCreatePlatformValidatorWallet } from "@/lib/platformWallet";
import type { ContentRequest } from "@/lib/types";

const bodySchema = z.object({
  prompt: z.string().min(1),
  modality: z.enum(["text", "image", "video", "audio"]),
  budgetUsdc: z.number().positive(),
  creatorId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  brand: z
    .object({
      name: z.string().optional(),
      colors: z.array(z.string()).optional(),
      industry: z.string().optional(),
      targetAudience: z.string().optional(),
      goal: z.string().optional(),
      emotion: z.string().optional(),
      voiceProfile: z.string().optional(),
      stylePrefix: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { agentId, ...request }: ContentRequest & { agentId?: string } = parsed.data;

  let agentRow: { id: string; walletAddress: string | null; onchainAgentId: string | null } | undefined;
  try {
    const db = await getDb();
    agentRow = agentId
      ? await db.get<{ id: string; walletAddress: string | null; onchainAgentId: string | null }>(
          "SELECT * FROM agents WHERE id = ?",
          [agentId]
        )
      : await db.get<{ id: string; walletAddress: string | null; onchainAgentId: string | null }>(
          "SELECT * FROM agents WHERE type = ? ORDER BY score DESC LIMIT 1",
          [request.modality]
        );
  } catch (err) {
    // A DB-layer failure here (bad DATABASE_URL, connection refused, schema
    // drift on a not-yet-migrated Postgres instance, etc.) previously threw
    // uncaught before the outer try/catch even started, so Next.js returned
    // its own HTML 500 page instead of JSON — the client's res.json() call
    // then threw its own opaque "Unexpected token <" parse error, which is
    // indistinguishable from "generation just fails" in the UI. Surface the
    // real cause instead.
    console.error("[content/generate] agent lookup failed:", err);
    return NextResponse.json(
      { error: `Could not look up agent: ${err instanceof Error ? err.message : "database error"}` },
      { status: 500 }
    );
  }

  if (!agentRow) {
    return NextResponse.json(
      { error: `No agent available for modality ${request.modality}` },
      { status: 404 }
    );
  }

  try {
    const db = await getDb();
    const record = await runDirector(request, agentRow.id);

    const developerShare = +(record.costUsdc * 0.9).toFixed(6);
    const platformShare = +(record.costUsdc * 0.1).toFixed(6);

    // Resolve the creator's *real* Circle wallet id (not their ownerId
    // string) — falls back to null (demo settlement) for guest sessions or
    // anyone who hasn't provisioned a wallet yet.
    const creatorWallet = await db.get<{ id: string }>(
      "SELECT id FROM wallets WHERE ownerId = ? ORDER BY createdAt DESC LIMIT 1",
      [request.creatorId]
    );

    const settlement = await settlePaymentSplit({
      fromWalletId: creatorWallet?.id ?? null,
      developerWalletAddress: agentRow.walletAddress ?? "0xdemoDeveloperWallet",
      platformWalletAddress: process.env.PLATFORM_WALLET_ADDRESS ?? "0xdemoPlatformWallet",
      totalUsdc: record.costUsdc,
    });

    // Record this generation's evaluation as onchain reputation feedback for
    // the sub-agent, via ERC-8004's ReputationRegistry — but only once the
    // agent actually has an onchain identity (npm run register-agent /
    // register-seed-agents), and never let this block or fail the response;
    // a reputation write is a side effect, not something a creator's content
    // request should ever 500 over.
    let reputationTxHash: string | undefined;
    let reputationWarning: string | undefined;
    if (agentRow.onchainAgentId) {
      try {
        const validatorWallet = await getOrCreatePlatformValidatorWallet();
        const feedback = await giveFeedback({
          validatorWalletAddress: validatorWallet.address,
          agentTokenId: agentRow.onchainAgentId,
          score: record.evaluation.score,
          tag: `${record.modality}-generation`,
        });
        reputationTxHash = feedback.txHash;
        reputationWarning = feedback.demo ? feedback.warning ?? validatorWallet.warning : undefined;
      } catch (err) {
        reputationWarning = err instanceof Error ? err.message : "Reputation feedback failed.";
      }
    }

    await db.run(
      `INSERT INTO content_records (id, creatorId, agentId, modality, prompt, enhancedPrompt, output, evaluationJson, costUsdc, developerShareUsdc, platformShareUsdc, reputationTxHash, reputationWarning, generationWarning, videoJobId, videoPollingUrl, videoStatus, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.creatorId,
        record.agentId,
        record.modality,
        record.prompt,
        record.enhancedPrompt,
        record.output,
        JSON.stringify(record.evaluation),
        record.costUsdc,
        developerShare,
        platformShare,
        reputationTxHash ?? null,
        reputationWarning ?? null,
        record.generationWarning ?? null,
        record.videoJobId ?? null,
        record.videoPollingUrl ?? null,
        record.videoStatus ?? null,
        record.createdAt,
      ]
    );

    await db.run(
      `INSERT INTO transactions (id, fromWallet, toWallet, amountUsdc, kind, createdAt, txHash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        request.creatorId,
        agentRow.walletAddress ?? "0xdemoDeveloperWallet",
        developerShare,
        "developer-payout",
        record.createdAt,
        settlement.developerTxHash ?? null,
      ]
    );
    await db.run(
      `INSERT INTO transactions (id, fromWallet, toWallet, amountUsdc, kind, createdAt, txHash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        request.creatorId,
        process.env.PLATFORM_WALLET_ADDRESS ?? "0xdemoPlatformWallet",
        platformShare,
        "platform-fee",
        record.createdAt,
        settlement.platformTxHash ?? null,
      ]
    );

    await db.run(`UPDATE agents SET transactionCount = transactionCount + 1 WHERE id = ?`, [
      agentRow.id,
    ]);

    // videoPollingUrl is server-internal (see ContentRecord.videoPollingUrl
    // in src/lib/types.ts) — /api/content/video-status looks it up from the
    // DB by record id, the client never needs or should see it directly.
    const { videoPollingUrl: _videoPollingUrl, ...clientRecord } = record;

    return NextResponse.json({
      ...clientRecord,
      developerShareUsdc: developerShare,
      platformShareUsdc: platformShare,
      settlementDemo: settlement.demo,
      settlementWarning: settlement.warning,
      reputationTxHash,
      reputationWarning,
    });
  } catch (err) {
    // Log the full error server-side (visible in Vercel's function logs)
    // even though the client only gets a short message — every sub-agent
    // call in runDirector() already degrades to demo output on failure
    // instead of throwing, so anything landing here is either the
    // "Budget too low" guard in director.ts, a settlement/DB issue, or a
    // genuine bug — worth having the stack trace for.
    console.error("[content/generate] request failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 }
    );
  }
}
