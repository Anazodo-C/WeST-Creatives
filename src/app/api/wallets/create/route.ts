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

  // Everything below is wrapped so this route always returns valid JSON
  // even on an unexpected failure (DB error, etc.) — an uncaught throw here
  // used to surface client-side as "Unexpected end of JSON input" because
  // Next's default error page isn't JSON.
  try {
    const db = await getDb();

    // Idempotent by ownerId: re-provisioning the same owner (e.g. a wallet
    // that disconnects and reconnects, or a signup form resubmitted) reuses
    // their existing wallet instead of minting a new one every time.
    const existing = await db.get<{ id: string; address: string; blockchain: string; demo: number }>(
      `SELECT id, address, blockchain, demo FROM wallets WHERE ownerId = ? ORDER BY createdAt ASC LIMIT 1`,
      [parsed.data.ownerId]
    );

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
    await db.run(
      `INSERT INTO wallets (id, ownerId, address, blockchain, demo, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        parsed.data.ownerId,
        wallet.address,
        wallet.blockchain,
        wallet.demo ? 1 : 0,
        new Date().toISOString(),
      ]
    );

    return NextResponse.json(wallet);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create wallet." },
      { status: 500 }
    );
  }
}
