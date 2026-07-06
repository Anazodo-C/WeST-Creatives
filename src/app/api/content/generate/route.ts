import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMultiDirector } from "@/lib/agents/director";
import type { CandidateAgent } from "@/lib/agents/scout";
import { settlePaymentSplit, giveFeedback, debitRefillReserve } from "@/lib/circle";
import { getOrCreatePlatformValidatorWallet, getOrCreatePlatformReserveWallet } from "@/lib/platformWallet";
import type { ContentModality, MultiContentRequest } from "@/lib/types";

const CONTENT_MODALITY = z.enum(["text", "image", "video", "audio"]);

// Accepts either the original single-modality shape (`modality`) or the new
// multi-modality shape (`modalities`, e.g. ["text", "image"] for "write a
// caption and make an image ad") — normalized to an array right after
// parsing. Both are supported indefinitely: `modality` isn't deprecated,
// it's just the one-element-array special case.
const bodySchema = z
  .object({
    prompt: z.string().min(1),
    modality: CONTENT_MODALITY.optional(),
    modalities: z.array(CONTENT_MODALITY).min(1).optional(),
    budgetUsdc: z.number().positive(),
    creatorId: z.string().min(1),
    // Per-modality agent override kept for API flexibility, but not surfaced
    // in the dashboard UI (which always lets the marketplace pick the
    // best-scored agent per modality).
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
  })
  .refine((data) => !!data.modality || (data.modalities && data.modalities.length > 0), {
    message: "Provide either modality or modalities.",
  });

type AgentRow = {
  id: string;
  name: string;
  model: string;
  priceUsdc: number;
  score: number;
  walletAddress: string | null;
  onchainAgentId: string | null;
};

function toCandidateAgent(row: AgentRow): CandidateAgent {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    priceUsdc: row.priceUsdc,
    score: row.score,
    walletAddress: row.walletAddress,
    onchainAgentId: row.onchainAgentId,
  };
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { agentId, modality, modalities: modalitiesInput, ...rest } = parsed.data;
  const modalities: ContentModality[] = modalitiesInput ?? [modality!];
  // De-dupe defensively — requesting ["image", "image"] should cost/produce
  // one image, not two, since that's almost certainly a client-side mistake
  // rather than an intentional "give me two images" request (there's no way
  // to express "two of the same modality" in this API today anyway).
  const uniqueModalities = Array.from(new Set(modalities));

  const request: MultiContentRequest = { ...rest, modalities: uniqueModalities };

  // candidatesByModality holds every public agent available for each
  // requested modality — the director's scoutAgents (src/lib/agents/scout.ts)
  // brute-forces the best-affordable combination from these, rather than
  // this route pre-picking a single "best" agent itself. An explicit
  // `agentId` override (API flexibility, not surfaced in the dashboard UI)
  // still short-circuits scouting: that one agent becomes the sole
  // candidate for every requested modality, same as before.
  let candidatesByModality: Partial<Record<ContentModality, CandidateAgent[]>> = {};
  let agentsById: Record<string, AgentRow> = {};
  try {
    const db = await getDb();
    if (agentId) {
      const row = await db.get<AgentRow>(
        "SELECT id, name, model, priceUsdc, score, walletAddress, onchainAgentId FROM agents WHERE id = ?",
        [agentId]
      );
      if (!row) {
        return NextResponse.json({ error: `No agent found with id ${agentId}` }, { status: 404 });
      }
      candidatesByModality = Object.fromEntries(uniqueModalities.map((m) => [m, [toCandidateAgent(row)]]));
      agentsById = { [row.id]: row };
    } else {
      const entries = await Promise.all(
        uniqueModalities.map(async (m) => {
          const rows = await db.all<AgentRow>(
            "SELECT id, name, model, priceUsdc, score, walletAddress, onchainAgentId FROM agents WHERE type = ? AND visibility = 'public' ORDER BY score DESC",
            [m]
          );
          return [m, rows] as const;
        })
      );
      const missing = entries.filter(([, rows]) => rows.length === 0).map(([m]) => m);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `No agent available for modality ${missing.join(", ")}` },
          { status: 404 }
        );
      }
      candidatesByModality = Object.fromEntries(
        entries.map(([m, rows]) => [m, rows.map(toCandidateAgent)])
      );
      agentsById = Object.fromEntries(entries.flatMap(([, rows]) => rows.map((r) => [r.id, r])));
    }
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

  try {
    const db = await getDb();

    const { batchId, records, selections, combinationsEvaluated } = await runMultiDirector(
      request,
      candidatesByModality
    );

    const creatorWallet = await db.get<{ id: string }>(
      "SELECT id FROM wallets WHERE ownerId = ? ORDER BY createdAt DESC LIMIT 1",
      [request.creatorId]
    );

    // Looked up once per request rather than per record — every record in
    // this batch debits the same reserve wallet, and a wallet lookup/create
    // should never happen more than once per request.
    const reserveWallet = await getOrCreatePlatformReserveWallet();

    const responseRecords = [];

    // Settlement, reputation, and persistence run per record — each
    // modality in the batch may have a different sub-agent (and therefore a
    // different developer wallet to pay), so this can't be collapsed into a
    // single settlement the way one-modality requests could.
    for (const record of records) {
      const agentRow = agentsById[record.agentId];
      const developerShare = +(record.costUsdc * 0.9).toFixed(6);
      const platformShare = +(record.costUsdc * 0.1).toFixed(6);

      const settlement = await settlePaymentSplit({
        fromWalletId: creatorWallet?.id ?? null,
        developerWalletAddress: agentRow.walletAddress ?? "0xdemoDeveloperWallet",
        platformWalletAddress: process.env.PLATFORM_WALLET_ADDRESS ?? "0xdemoPlatformWallet",
        totalUsdc: record.costUsdc,
      });

      // Testnet-USDC debit equal to this record's real-dollar cost, from
      // the platform's refill-reserve wallet to PLATFORM_WALLET_ADDRESS —
      // simulates (in test USDC, per the hackathon's constraint that all
      // payments stay on testnet until Arc mainnet is live) the refill this
      // generation would need on the real provider balance. Never blocks or
      // fails the response — same demo-safe pattern as settlement/reputation.
      const reserveDebit = await debitRefillReserve({
        reserveWalletId: reserveWallet.id,
        amountUsdc: record.costUsdc,
      });

      // Record this generation's evaluation as onchain reputation feedback
      // for the sub-agent, via ERC-8004's ReputationRegistry — but only
      // once the agent actually has an onchain identity, and never let this
      // block or fail the response; a reputation write is a side effect,
      // not something a creator's content request should ever 500 over.
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
        `INSERT INTO content_records (id, creatorId, agentId, modality, batchId, prompt, enhancedPrompt, output, evaluationJson, costUsdc, developerShareUsdc, platformShareUsdc, reputationTxHash, reputationWarning, generationWarning, videoJobId, videoPollingUrl, videoStatus, reserveDebitTxHash, reserveDebitWarning, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.creatorId,
          record.agentId,
          record.modality,
          record.batchId,
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
          reserveDebit.txHash ?? null,
          reserveDebit.demo ? reserveDebit.warning ?? null : null,
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

      await db.run(`UPDATE agents SET transactionCount = transactionCount + 1 WHERE id = ?`, [agentRow.id]);

      // videoPollingUrl is server-internal (see ContentRecord.videoPollingUrl
      // in src/lib/types.ts) — /api/content/video-status looks it up from
      // the DB by record id, the client never needs or should see it.
      const { videoPollingUrl: _videoPollingUrl, ...clientRecord } = record;

      responseRecords.push({
        ...clientRecord,
        developerShareUsdc: developerShare,
        platformShareUsdc: platformShare,
        settlementDemo: settlement.demo,
        settlementWarning: settlement.warning,
        reputationTxHash,
        reputationWarning,
        reserveDebitTxHash: reserveDebit.txHash,
        reserveDebitWarning: reserveDebit.demo ? reserveDebit.warning : undefined,
        // Which agent the director actually hired for this modality, and
        // what model backs it — the visible half of the autonomous
        // selection (see scoutSummary below for the decision itself).
        agentName: agentRow.name,
        agentModel: agentRow.model,
      });
    }

    // The autonomous decision itself, surfaced for transparency/demo
    // purposes — how many agent combinations the director evaluated and
    // which one it picked per modality, alongside its combined score/cost.
    const scoutSummary = {
      combinationsEvaluated,
      selections: selections.map((s) => ({
        modality: s.modality,
        agentId: s.agent.id,
        agentName: s.agent.name,
        model: s.agent.model,
        priceUsdc: s.agent.priceUsdc,
        score: s.agent.score,
      })),
    };

    return NextResponse.json({ batchId, records: responseRecords, scoutSummary });
  } catch (err) {
    // Log the full error server-side (visible in Vercel's function logs)
    // even though the client only gets a short message — every sub-agent
    // call in runMultiDirector() already degrades to demo output on
    // failure instead of throwing, so anything landing here is either the
    // "Budget too low" guard in director.ts, a settlement/DB issue, or a
    // genuine bug — worth having the stack trace for.
    console.error("[content/generate] request failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 }
    );
  }
}
