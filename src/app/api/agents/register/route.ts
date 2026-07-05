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
  const db = getDb();
  const id = randomUUID();
  const wallet = await createWallet(`agent-${data.name}`);

  db.prepare(
    `INSERT INTO agents (id, name, developerId, description, type, capabilities, model, nicheSocialMedia, nicheIndustry, modality, scope, generationParadigm, rank, score, transactionCount, priceUsdc, walletAddress, visibility, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 50, 0, ?, ?, ?, ?)`
  ).run(
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
    new Date().toISOString()
  );

  return NextResponse.json({
    id,
    walletAddress: wallet.address,
    demo: wallet.demo,
    // Real onchain identity registration (ERC-8004) happens via
    // `npm run register-agent -- --agentId=<id>` — see scripts/register-agent.ts
    note: "Agent stored locally. Run `npm run register-agent` to anchor its identity on Arc Testnet.",
  });
}
