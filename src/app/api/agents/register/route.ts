import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { createWallet } from "@/lib/circle";

const bodySchema = z.object({
  name: z.string().min(1),
  developerId: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["director", "video", "audio", "image", "text", "editing", "custom"]),
  capabilities: z.array(z.string()).default([]),
  model: z.string().min(1),
  nicheSocialMedia: z.string().optional(),
  nicheIndustry: z.string().optional(),
  modality: z.enum(["unimodal", "cross-modal", "multi-modal"]).default("unimodal"),
  scope: z.enum(["general", "specialized"]).default("specialized"),
  generationParadigm: z.enum(["auto-regressive", "diffusion"]).default("auto-regressive"),
  priceUsdc: z.number().positive(),
  // 'personal' = a creator's own director agent — never shown in the public
  // /agents marketplace. Defaults to 'public' for real marketplace agents.
  visibility: z.enum(["public", "personal"]).default("public"),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Wrapped so this route always returns valid JSON even on an unexpected
  // failure (DB error, wallet creation error, etc.) instead of letting an
  // uncaught throw produce Next's non-JSON error page, which is what broke
  // the client's res.json() call.
  try {
    const db = await getDb();

    // A creator's personal director agent is a singleton: re-running signup
    // provisioning for the same developerId (e.g. a wallet reconnecting)
    // should return their existing personal agent, not mint a duplicate.
    if (data.visibility === "personal") {
      const existing = await db.get<{ id: string; walletAddress: string | null }>(
        `SELECT id, walletAddress FROM agents WHERE developerId = ? AND visibility = 'personal' LIMIT 1`,
        [data.developerId]
      );

      if (existing) {
        return NextResponse.json({
          id: existing.id,
          walletAddress: existing.walletAddress,
          demo: undefined,
          reused: true,
          note: "Existing personal director agent reused for this owner.",
        });
      }
    }

    const id = randomUUID();
    const wallet = await createWallet(`agent-${data.name}`);

    await db.run(
      `INSERT INTO agents (id, name, developerId, description, type, capabilities, model, nicheSocialMedia, nicheIndustry, modality, scope, generationParadigm, rank, score, transactionCount, priceUsdc, walletAddress, visibility, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 50, 0, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.developerId,
        data.description,
        data.type,
        JSON.stringify(data.capabilities),
        data.model,
        data.nicheSocialMedia ?? null,
        data.nicheIndustry ?? null,
        data.modality,
        data.scope,
        data.generationParadigm,
        data.priceUsdc,
        wallet.address,
        data.visibility,
        new Date().toISOString(),
      ]
    );

    return NextResponse.json({
      id,
      walletAddress: wallet.address,
      demo: wallet.demo,
      warning: wallet.warning,
      // Real onchain identity registration (ERC-8004) happens via
      // `npm run register-agent -- --agentId=<id>` — see scripts/register-agent.ts
      note: "Agent stored locally. Run `npm run register-agent` to anchor its identity on Arc Testnet.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register agent." },
      { status: 500 }
    );
  }
}
