/**
 * Director agent: the creator's own always-on agent. Enhances the prompt,
 * hires the right sub-agent for the requested modality within budget, runs
 * evaluation, and returns a full ContentRecord ready to persist + settle
 * payment for.
 */
import { randomUUID } from "node:crypto";
import type { ContentRequest, ContentRecord } from "@/lib/types";
import { enhancePrompt, generateText } from "@/lib/agents/text";
import { buildImageAttributes, generateImage } from "@/lib/agents/image";
import { planScenes, submitVideoJob } from "@/lib/agents/video";
import { generateAudio } from "@/lib/agents/audio";
import { evaluateOutput } from "@/lib/agents/evaluate";
import { AGENT_PRICE_USDC } from "@/lib/pricing";

export async function runDirector(
  request: ContentRequest,
  agentId: string
): Promise<Omit<ContentRecord, "developerShareUsdc" | "platformShareUsdc">> {
  const cost = AGENT_PRICE_USDC[request.modality];
  if (cost > request.budgetUsdc) {
    throw new Error(
      `Budget too low: ${request.modality} agent costs ${cost} USDC, budget is ${request.budgetUsdc}`
    );
  }

  const enhancedPrompt = await enhancePrompt(request.prompt, request.brand);

  let output = "";
  let generationWarning: string | undefined;
  let videoStatus: "pending" | "completed" | "failed" | undefined;
  let videoJobId: string | undefined;
  let videoPollingUrl: string | undefined;
  if (request.modality === "text") {
    output = await generateText(enhancedPrompt, request.brand);
  } else if (request.modality === "image") {
    const attrs = buildImageAttributes(enhancedPrompt, request.brand);
    const img = await generateImage(attrs, request.brand);
    output = img.url || img.description;
    generationWarning = img.warning;
  } else if (request.modality === "video") {
    // Video is submitted as an async job and never awaited to completion
    // here — see the module comment in video.ts. `output` starts as the
    // storyboard placeholder text; /api/content/video-status polling swaps
    // it for the real rendered URL once the job finishes.
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

  const evaluation = await evaluateOutput({
    modality: request.modality,
    prompt: enhancedPrompt,
    output,
  });

  return {
    id: randomUUID(),
    creatorId: request.creatorId,
    agentId,
    modality: request.modality,
    prompt: request.prompt,
    enhancedPrompt,
    output,
    evaluation,
    costUsdc: cost,
    generationWarning,
    videoStatus,
    videoJobId,
    videoPollingUrl,
    createdAt: new Date().toISOString(),
  };
}

export { AGENT_PRICE_USDC };
