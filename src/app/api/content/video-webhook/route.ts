import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { interpretVideoWebhookPayload } from "@/lib/agents/video";

const OPENROUTER_WEBHOOK_SECRET = process.env.OPENROUTER_WEBHOOK_SECRET;
const FIVE_MINUTES_IN_SECONDS = 300;

/** Verifies OpenRouter's webhook signature per their docs:
 * openrouter.ai/docs/guides/overview/multimodal/video-generation#signing-secret
 * Header shape: "X-OpenRouter-Signature: t=<unix ts>,v1=<hex hmac-sha256>",
 * computed over `${timestamp},${rawBody}` with the workspace signing secret
 * as the HMAC key. Must run against the *raw* request body — parsing and
 * re-serializing JSON can change key order/number formatting and break the
 * signature, which is why this route reads req.text() once instead of
 * req.json(). */
function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const hash = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !hash) return false;

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Number.isNaN(age) || age > FIVE_MINUTES_IN_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp},${rawBody}`).digest("hex");
  if (expected.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

/**
 * Receives OpenRouter's video-generation webhook (see the callback_url wired
 * in src/lib/agents/video.ts's submitVideoJob) and updates the matching
 * content_records row the moment a job actually finishes — server-side,
 * independent of whether the dashboard's client-side polling
 * (src/app/api/content/video-status/route.ts) happens to have a tab open at
 * that moment. This is the fix for jobs that finish rendering minutes after
 * the creator has navigated away or closed the tab: without this, nothing
 * updates the record until they happen to revisit the dashboard with it
 * still open long enough for the next ~8s poll.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (OPENROUTER_WEBHOOK_SECRET) {
    const signature = req.headers.get("x-openrouter-signature");
    if (!verifySignature(rawBody, signature, OPENROUTER_WEBHOOK_SECRET)) {
      console.error("[video-webhook] signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // No signing secret configured (OPENROUTER_WEBHOOK_SECRET unset) —
    // accept unverified. Set one in your OpenRouter workspace settings +
    // this env var once this is live, so a stray POST to this URL can't
    // spoof a job as completed/failed.
    console.warn("[video-webhook] OPENROUTER_WEBHOOK_SECRET not set — accepting unverified webhook payload");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = interpretVideoWebhookPayload(payload);
  if (!result) {
    // Not a recognizable video-job event — acknowledge anyway so
    // OpenRouter doesn't retry a payload we're never going to understand.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const db = await getDb();
  const row = await db.get<{ id: string; output: string; videoStatus: string | null }>(
    "SELECT id, output, videoStatus FROM content_records WHERE videoJobId = ?",
    [result.jobId]
  );

  if (!row) {
    // Could be a webhook for a job this deployment doesn't know about
    // (e.g. a stale/duplicate delivery, or DATABASE_URL pointing somewhere
    // different than when the job was submitted) — nothing to update.
    return NextResponse.json({ ok: true, matched: false });
  }

  // Idempotent: a terminal status won't be overwritten by a later/duplicate
  // delivery of the same event.
  if (row.videoStatus !== "pending") {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  const newOutput = result.status === "completed" && result.url ? result.url : row.output;

  await db.run("UPDATE content_records SET output = ?, videoStatus = ?, generationWarning = ? WHERE id = ?", [
    newOutput,
    result.status,
    result.warning ?? null,
    row.id,
  ]);

  return NextResponse.json({ ok: true });
}
