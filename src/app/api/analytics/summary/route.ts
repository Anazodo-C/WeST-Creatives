import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT COUNT(*) as contentCount, COALESCE(SUM(costUsdc),0) as totalSpend,
              COALESCE(SUM(developerShareUsdc),0) as developerEarnings,
              COALESCE(SUM(platformShareUsdc),0) as platformRevenue
       FROM content_records`
    )
    .get() as {
    contentCount: number;
    totalSpend: number;
    developerEarnings: number;
    platformRevenue: number;
  };

  const txCount = (
    db.prepare("SELECT COUNT(*) as c FROM transactions").get() as { c: number }
  ).c;

  const leaderboard = db
    .prepare(
      `SELECT id, name, type, score, transactionCount, priceUsdc FROM agents ORDER BY score DESC LIMIT 10`
    )
    .all();

  const byModality = db
    .prepare(
      `SELECT modality, COUNT(*) as count, COALESCE(SUM(costUsdc),0) as spend FROM content_records GROUP BY modality`
    )
    .all();

  const recent = db
    .prepare(
      `SELECT id, modality, costUsdc, createdAt FROM content_records ORDER BY createdAt DESC LIMIT 20`
    )
    .all();

  return NextResponse.json({
    totals: { ...totals, transactionCount: txCount },
    leaderboard,
    byModality,
    recent,
  });
}
