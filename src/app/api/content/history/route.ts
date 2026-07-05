import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  const db = getDb();
  const rows = creatorId
    ? db
        .prepare(
          "SELECT * FROM content_records WHERE creatorId = ? ORDER BY createdAt DESC"
        )
        .all(creatorId)
    : db.prepare("SELECT * FROM content_records ORDER BY createdAt DESC LIMIT 50").all();

  return NextResponse.json({ records: rows });
}
