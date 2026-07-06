/**
 * Director agent: the creator's own always-on agent. Enhances the prompt
 * *once*, then hires whichever sub-agent(s) the request calls for within
 * budget, runs evaluation per output, and returns ContentRecords ready to
 * persist + settle payment for.
 *
 * A single creative brief can fan out to multiple modalities at once (e.g.
 * "write a caption and make an image ad for this") — runMultiDirector is the
 * real implementation; runDirector (the original single-modality entry
 * point, still used by any single-modality caller) is now a thin wrapper
 * around it with a one-element modalities array, so existing behavior is
 * unchanged bit-for-bit. This works cleanly because enhancePrompt() was
 * already modality-agnostic (a general creative brief), with each
 * modality's own branch below doing its own modality-specific compilation
 * on top of that *same* shared brief (buildImageAttributes for composition,
 * planScenes for camera language, generateAudio's voice-profile prefix,
 * generateText's copywriting pass) — there was no per-modality prompt
 * splitting to build, just a loop over the existing branches.
 */
import { randomUUID } from "node:crypto";
import type { ContentRequest, ContentRecord, MultiContentRequest, ContentModality } from "@/lib/types";
import { enhancePrompt, generateText } from "@/lib/agents/text";
import { buildImageAttributes, generateImage } from "@/lib/agents/image";
import { planScenes, submitVideoJob } from "@/lib/agents/video";
import { generateAudio } from "@/lib/agents/audio";
import { evaluateOutput } from "@/lib/agents/evaluate";
import { AGENT_PRICE_USDC } from "@/lib/pricing";

type DirectorRecord = Omit<ContentRecord, "developerShareUsdc" | "platformShareUsdc">;

export async function runMultiDirector(
  request: MultiContentRequest,
  agentIdByModality: Record<ContentModality, string>
): Promise<{ batchId: string; records: DirectorRecord[] }> {
  if (request.modalities.length === 0) {
    throw new Error("At least one content type must be requested.");
  }

  const totalCost = request.modalities.reduce((sum, m) => sum + AGENT_PRICE_USDC[m], 0);
  if (totalCost > request.budgetUsdc) {
    throw new Error(
      `Budget too low: ${request.modalities.join(" + ")} cost ${totalCost} USDC total, budget is ${request.budgetUsdc}`
    );
  }

  // One enhancement call covers every modality in this batch — cheaper and
  // more coherent than re-interpreting the raw prompt per modality (a
  // separate image brief and text brief for the same request could easily
  // drift into unrelated creative directions otherwise).
  const enhancedPrompt = await enhancePrompt(request.prompt, request.brand);
  const batchId = randomUUID();
  const records: DirectorRecord[] = [];

  for (const modality of request.modalities) {
    let output = "";
    let generationWarning: string | undefined;
    let videoStatus: "pending" | "completed" | "failed" | undefined;
    let videoJobId: string | undefined;
    let videoPollingUrl: string | undefined;

    if (modality === "text") {
      output = await generateText(enhancedPrompt, request.brand);
    } else if (modality === "image") {
      const attrs = buildImageAttributes(enhancedPrompt, request.brand);
      const img = await generateImage(attrs, request.brand);
      output = img.url || img.description;
      generationWarning = img.warning;
    } else if (modality === "video") {
      // Video is submitted as an async job and never awaited to completion
      // here — see the module comment in video.ts. `output` starts as the
      // storyboard placeholder text; /api/content/video-status polling
      // swaps it for the real rendered URL once the job finishes.
      const scenes = planScenes(enhancedPrompt);
      const vid = await submitVideoJob(scenes, request.brand);
      output = vid.storyboard;
      generationWarning = vid.warning;
      videoJobId = vid.jobId;
      videoPollingUrl = vid.pollingUrl;
      videoStatus = vid.jobId ? "pending" : undefined;
    } else {
      const audio = await generateAudio(enhancedPrompt, request.brand);
      output = audio.url || audio.script;
    }

    const evaluation = await evaluateOutput({ modality, prompt: enhancedPrompt, output });

    records.push({
      id: randomUUID(),
      creatorId: request.creatorId,
      agentId: agentIdByModality[modality],
      modality,
      batchId,
      prompt: request.prompt,
      enhancedPrompt,
      output,
      evaluation,
      costUsdc: AGENT_PRICE_USDC[modality],
      generationWarning,
      videoStatus,
      videoJobId,
      videoPollingUrl,
      createdAt: new Date().toISOString(),
    });
  }

  return { batchId, records };
}

export async function runDirector(request: ContentRequest, agentId: string): Promise<DirectorRecord> {
  const { records } = await runMultiDirector(
    { ...request, modalities: [request.modality] },
    { [request.modality]: agentId } as Record<ContentModality, string>
  );
  return records[0];
}

export { AGENT_PRICE_USDC };
