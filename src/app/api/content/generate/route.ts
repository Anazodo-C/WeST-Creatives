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
  const db = getDb();

  const agentRow = agentId
    ? (db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as
        | { id: string; walletAddress: string | null }
        | undefined)
    : (db
        .prepare("SELECT * FROM agents WHERE type = ? ORDER BY score DESC LIMIT 1")
        .get(request.modality) as { id: string; walletAddress: string | null } | undefined);

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

    const settlement = await settlePaymentSplit({
      fromWalletId: request.creatorId,
      developerWalletAddress: agentRow.walletAddress ?? "0xdemoDeveloperWallet",
      platformWalletAddress: process.env.PLATFORM_WALLET_ADDRESS ?? "0xdemoPlatformWallet",
      totalUsdc: record.costUsdc,
    });

    db.prepare(
      `INSERT INTO content_records (id, creatorId, agentId, modality, prompt, enhancedPrompt, output, evaluationJson, costUsdc, developerShareUsdc, platformShareUsdc, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      record.createdAt
    );

    db.prepare(
      `INSERT INTO transactions (id, fromWallet, toWallet, amountUsdc, kind, createdAt, txHash) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      request.creatorId,
      agentRow.walletAddress ?? "0xdemoDeveloperWallet",
      developerShare,
      "developer-payout",
      record.createdAt,
      settlement.developerTxHash ?? null
    );
    db.prepare(
      `INSERT INTO transactions (id, fromWallet, toWallet, amountUsdc, kind, createdAt, txHash) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      request.creatorId,
      process.env.PLATFORM_WALLET_ADDRESS ?? "0xdemoPlatformWallet",
      platformShare,
      "platform-fee",
      record.createdAt,
      settlement.platformTxHash ?? null
    );

    db.prepare(
      `UPDATE agents SET transactionCount = transactionCount + 1 WHERE id = ?`
    ).run(agentRow.id);

    return NextResponse.json({
      ...record,
      developerShareUsdc: developerShare,
      platformShareUsdc: platformShare,
      settlementDemo: settlement.demo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 }
    );
  }
}
