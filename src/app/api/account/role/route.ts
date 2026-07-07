import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Resolves which role (creator vs developer) an ownerId is — used by
 * src/app/dashboard/page.tsx when a wallet reconnects on a browser/device
 * where vibe.role was never stored locally (or got cleared): the ownerId
 * itself is trivially reconstructible from the connected address
 * (`wallet-${address}`, same scheme signup uses), but *role* isn't encoded
 * in that string, so it has to come from what's actually in the database.
 *
 * Every account gets exactly one of two agent shapes at signup (see
 * src/app/signup/page.tsx): a creator gets a single `visibility: 'personal'`
 * director agent; a developer registers one or more `visibility: 'public'`
 * agents via the dashboard's registration form. Checking which kind of
 * agent row exists for this developerId is enough to recover the role
 * without guessing.
 *
 * GET /api/account/role?ownerId=...
 * Returns { role: "creator" | "developer" | null } — null means no agent
 * was ever registered under this ownerId (e.g. a wallet that was
 * connected but never actually completed signup).
 */
export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get("ownerId");
  if (!ownerId) {
    return NextResponse.json({ error: "ownerId is required" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const row = await db.get<{ visibility: string | null }>(
      "SELECT visibility FROM agents WHERE developerId = ? ORDER BY createdAt ASC LIMIT 1",
      [ownerId]
    );

    const role = row?.visibility === "personal" ? "creator" : row?.visibility === "public" ? "developer" : null;
    return NextResponse.json({ role });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve role." },
      { status: 500 }
    );
  }
}
