import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { runDirector } from "@/lib/agents/director";
import { settlePaymentSplit } from "@/lib/circle";
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
  const db = await getDb();

  const agentRow = agentId
    ? await db.get<{ id: string; walletAddress: string | null }>(
        "SELECT * FROM agents WHERE id = ?",
        [agentId]
      )
    : await db.get<{ id: string; walletAddress: string | null }>(
        "SELECT * FROM agents WHERE type = ? ORDER BY score DESC LIMIT 1",
        [request.modality]
      );

  if (!agentRow) {
    return NextResponse.json(
      { error: `No agent available for modality ${request.modality}` },
      { status: 404 }
    );
  }

  try {
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

    await db.run(
      `INSERT INTO content_records (id, creatorId, agentId, modality, prompt, enhancedPrompt, output, evaluationJson, costUsdc, developerShareUsdc, platformShareUsdc, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    return NextResponse.json({
      ...record,
      developerShareUsdc: developerShare,
      platformShareUsdc: platformShare,
      settlementDemo: settlement.demo,
      settlementWarning: settlement.warning,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 }
    );
  }
}
