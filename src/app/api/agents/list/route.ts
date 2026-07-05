import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = await getDb();
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM agents WHERE visibility = 'public' ORDER BY score DESC, rank ASC"
  );

  const agents = rows.map((r) => ({
    ...r,
    capabilities: r.capabilities ? JSON.parse(r.capabilities as string) : [],
  }));

  return NextResponse.json({ agents });
}
