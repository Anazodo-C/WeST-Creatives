import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = await getDb();

  const totals = await db.get<{
    contentCount: number;
    totalSpend: number;
    developerEarnings: number;
    platformRevenue: number;
  }>(
    `SELECT COUNT(*) as contentCount, COALESCE(SUM(costUsdc),0) as totalSpend,
            COALESCE(SUM(developerShareUsdc),0) as developerEarnings,
            COALESCE(SUM(platformShareUsdc),0) as platformRevenue
     FROM content_records`
  );

  const txCountRow = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM transactions");
  const txCount = txCountRow?.c ?? 0;

  const leaderboard = await db.all(
    `SELECT id, name, type, score, transactionCount, priceUsdc FROM agents ORDER BY score DESC LIMIT 10`
  );

  const byModality = await db.all(
    `SELECT modality, COUNT(*) as count, COALESCE(SUM(costUsdc),0) as spend FROM content_records GROUP BY modality`
  );

  const recent = await db.all(
    `SELECT id, modality, costUsdc, createdAt FROM content_records ORDER BY createdAt DESC LIMIT 20`
  );

  return NextResponse.json({
    totals: { ...totals, transactionCount: txCount },
    leaderboard,
    byModality,
    recent,
  });
}
