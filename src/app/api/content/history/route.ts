import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  const db = await getDb();
  const rows = creatorId
    ? await db.all("SELECT * FROM content_records WHERE creatorId = ? ORDER BY createdAt DESC", [
        creatorId,
      ])
    : await db.all("SELECT * FROM content_records ORDER BY createdAt DESC LIMIT 50");

  return NextResponse.json({ records: rows });
}
