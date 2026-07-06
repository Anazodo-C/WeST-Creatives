import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { createWallet, requestFaucetDrip } from "@/lib/circle";

const bodySchema = z.object({
  ownerId: z.string().min(1),
});

/**
 * "Deposit USDC" button, real implementation: resolves (or lazily creates)
 * the owner's wallet, then requests a real testnet USDC drip to it via
 * Circle's faucet API — no external site needed. Idempotent wallet lookup
 * mirrors /api/wallets/create; never throws an uncaught error into a non-JSON
 * 500, same reasoning as every other route in this app.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();

    let wallet = await db.get<{ address: string }>(
      `SELECT address FROM wallets WHERE ownerId = ? ORDER BY createdAt ASC LIMIT 1`,
      [parsed.data.ownerId]
    );

    if (!wallet) {
      const created = await createWallet(parsed.data.ownerId);
      await db.run(
        `INSERT INTO wallets (id, ownerId, address, blockchain, demo, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), parsed.data.ownerId, created.address, created.blockchain, created.demo ? 1 : 0, new Date().toISOString()]
      );
      wallet = { address: created.address };
    }

    const result = await requestFaucetDrip(wallet.address);
    return NextResponse.json({ address: wallet.address, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Faucet request failed." },
      { status: 500 }
    );
  }
}
