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

  const wallet = await createWallet(parsed.data.label);
  const db = getDb();
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
