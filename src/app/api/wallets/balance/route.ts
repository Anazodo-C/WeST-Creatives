import { NextRequest, NextResponse } from "next/server";
import { getNativeUsdcBalance } from "@/lib/arc";
import type { Address } from "viem";

/**
 * Reads a wallet's live USDC balance directly from Arc Testnet (Arc's native
 * gas token is USDC — see getNativeUsdcBalance in src/lib/arc.ts). A plain
 * RPC read, so this works even for demo/fake addresses (just returns "0")
 * and needs no Circle keys.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const balance = await getNativeUsdcBalance(address as Address);
    return NextResponse.json({ address, balance });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read balance." },
      { status: 500 }
    );
  }
}
