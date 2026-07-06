import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pollVideoJob } from "@/lib/agents/video";

/**
 * A single status check for an in-flight async video job (see the module
 * comment in src/lib/agents/video.ts for why video generation is async in
 * the first place). Polled by the dashboard every ~8s for any content
 * record whose videoStatus is "pending" — each call here does exactly one
 * check against OpenRouter and returns immediately, never loops/sleeps.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const db = await getDb();
  const row = await db.get<{
    id: string;
    output: string;
    videoStatus: string | null;
    videoPollingUrl: string | null;
    generationWarning: string | null;
  }>(
    "SELECT id, output, videoStatus, videoPollingUrl, generationWarning FROM content_records WHERE id = ?",
    [id]
  );

  if (!row) {
    return NextResponse.json({ error: "Content record not found" }, { status: 404 });
  }

  // Already resolved (or never was an async job) — nothing to poll, just
  // report the current state.
  if (row.videoStatus !== "pending" || !row.videoPollingUrl) {
    return NextResponse.json({
      videoStatus: row.videoStatus,
      output: row.output,
      generationWarning: row.generationWarning,
    });
  }

  const poll = await pollVideoJob(row.videoPollingUrl);

  if (poll.status === "pending") {
    // Still rendering — leave the DB row untouched, just relay the same
    // storyboard placeholder the client already has.
    return NextResponse.json({
      videoStatus: "pending",
      output: row.output,
      generationWarning: row.generationWarning,
    });
  }

  const newOutput = poll.status === "completed" && poll.url ? poll.url : row.output;
  const newWarning = poll.status === "failed" ? poll.warning ?? "Video generation failed." : row.generationWarning;

  await db.run("UPDATE content_records SET output = ?, videoStatus = ?, generationWarning = ? WHERE id = ?", [
    newOutput,
    poll.status,
    newWarning ?? null,
    id,
  ]);

  return NextResponse.json({ videoStatus: poll.status, output: newOutput, generationWarning: newWarning });
}
