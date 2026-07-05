import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { createWallet } from "@/lib/circle";

const bodySchema = z.object({
  ownerId: z.string().min(1),
  label: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();

  // Idempotent by ownerId: re-provisioning the same owner (e.g. a wallet
  // that disconnects and reconnects, or a signup form resubmitted) reuses
  // their existing wallet instead of minting a new one every time.
  const existing = db
    .prepare(`SELECT id, address, blockchain, demo FROM wallets WHERE ownerId = ? ORDER BY createdAt ASC LIMIT 1`)
    .get(parsed.data.ownerId) as { id: string; address: string; blockchain: string; demo: number } | undefined;

  if (existing) {
    return NextResponse.json({
      id: existing.id,
      address: existing.address,
      blockchain: existing.blockchain,
      demo: !!existing.demo,
      reused: true,
    });
  }

  const wallet = await createWallet(parsed.data.label);
  db.prepare(
    `INSERT INTO wallets (id, ownerId, address, blockchain, demo, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    parsed.data.ownerId,
    wallet.address,
    wallet.blockchain,
    wallet.demo ? 1 : 0,
    new Date().toISOString()
  );

  return NextResponse.json(wallet);
}
