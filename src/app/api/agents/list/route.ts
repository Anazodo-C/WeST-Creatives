import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM agents WHERE visibility = 'public' ORDER BY score DESC, rank ASC"
    )
    .all() as Record<string, unknown>[];

  const agents = rows.map((r) => ({
    ...r,
    capabilities: r.capabilities ? JSON.parse(r.capabilities as string) : [],
  }));

  return NextResponse.json({ agents });
}
