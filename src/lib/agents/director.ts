/**
 * Director agent: the creator's own always-on agent. Enhances the prompt
 * *once*, then autonomously scouts the marketplace for the best sub-agent(s)
 * the stated budget can afford (see scoutAgents in
 * src/lib/agents/scout.ts), runs evaluation per output, and returns
 * ContentRecords ready to persist + settle payment for.
 *
 * A single creative brief can fan out to multiple modalities at once (e.g.
 * "write a caption and make an image ad for this") — runMultiDirector is the
 * real implementation; runDirector (a single-modality convenience wrapper)
 * is a thin wrapper around it with a one-element modalities array. This
 * works cleanly because enhancePrompt() was already modality-agnostic (a
 * general creative brief), with each modality's own branch below doing its
 * own modality-specific compilation on top of that *same* shared brief
 * (buildImageAttributes for composition, planScenes for camera language,
 * generateAudio's voice-profile prefix, generateText's copywriting pass) —
 * there was no per-modality prompt splitting to build, just a loop over the
 * existing branches, now parameterized by whichever agent scoutAgents picked
 * for that modality (its own model, not a single fixed one per modality).
 */
import { randomUUID } from "node:crypto";
import type { ContentRequest, ContentRecord, MultiContentRequest, ContentModality } from "@/lib/types";
import { enhancePrompt, generateText } from "@/lib/agents/text";
import { buildImageAttributes, generateImage } from "@/lib/agents/image";
import { planScenes, submitVideoJob } from "@/lib/agents/video";
import { generateAudio } from "@/lib/agents/audio";
import { evaluateOutput } from "@/lib/agents/evaluate";
import { scoutAgents, type CandidateAgent, type ScoutSelection } from "@/lib/agents/scout";
import { AGENT_PRICE_USDC } from "@/lib/pricing";

type DirectorRecord = Omit<ContentRecord, "developerShareUsdc" | "platformShareUsdc">;

export interface MultiDirectorResult {
  batchId: string;
  records: DirectorRecord[];
  /** Which agent scoutAgents hired for each modality, and how many
   * combinations it evaluated to get there — surfaced so the UI/API can
   * show the autonomous decision, not just its output. */
  selections: ScoutSelection[];
  combinationsEvaluated: number;
}

export async function runMultiDirector(
  request: MultiContentRequest,
  candidatesByModality: Partial<Record<ContentModality, CandidateAgent[]>>
): Promise<MultiDirectorResult> {
  if (request.modalities.length === 0) {
    throw new Error("At least one content type must be requested.");
  }

  // Autonomous decision: brute-force every one-agent-per-modality
  // combination the marketplace has candidates for, and hire the
  // highest-combined-score combination the budget can actually afford.
  const scouted = scoutAgents(candidatesByModality, request.modalities, request.budgetUsdc);
  if (!scouted.withinBudget) {
    throw new Error(
      `Budget too low: cheapest available combination for ${request.modalities.join(" + ")} costs ` +
        `${scouted.totalCost} USDC total, budget is ${request.budgetUsdc}`
    );
  }

  const agentByModality = Object.fromEntries(
    scouted.selections.map((s) => [s.modality, s.agent])
  ) as Record<ContentModality, CandidateAgent>;

  // One enhancement call covers every modality in this batch — cheaper and
  // more coherent than re-interpreting the raw prompt per modality (a
  // separate image brief and text brief for the same request could easily
  // drift into unrelated creative directions otherwise).
  const enhancedPrompt = await enhancePrompt(request.prompt, request.brand);
  const batchId = randomUUID();
  const records: DirectorRecord[] = [];

  for (const modality of request.modalities) {
    const agent = agentByModality[modality];
    let output = "";
    let generationWarning: string | undefined;
    let videoStatus: "pending" | "completed" | "failed" | undefined;
    let videoJobId: string | undefined;
    let videoPollingUrl: string | undefined;

    if (modality === "text") {
      output = await generateText(enhancedPrompt, request.brand, agent.model);
    } else if (modality === "image") {
      const attrs = buildImageAttributes(enhancedPrompt, request.brand);
      const img = await generateImage(attrs, request.brand, agent.model);
      output = img.url || img.description;
      generationWarning = img.warning;
    } else if (modality === "video") {
      // Video is submitted as an async job and never awaited to completion
      // here — see the module comment in video.ts. `output` starts as the
      // storyboard placeholder text; /api/content/video-status polling
      // swaps it for the real rendered URL once the job finishes.
      const scenes = planScenes(enhancedPrompt);
      const vid = await submitVideoJob(scenes, request.brand, agent.model);
      output = vid.storyboard;
      generationWarning = vid.warning;
      videoJobId = vid.jobId;
      videoPollingUrl = vid.pollingUrl;
      videoStatus = vid.jobId ? "pending" : undefined;
    } else {
      const audio = await generateAudio(enhancedPrompt, request.brand, agent.model);
      output = audio.url || audio.script;
      generationWarning = audio.warning;
    }

    const evaluation = await evaluateOutput({ modality, prompt: enhancedPrompt, output });

    records.push({
      id: randomUUID(),
      creatorId: request.creatorId,
      agentId: agent.id,
      modality,
      batchId,
      prompt: request.prompt,
      enhancedPrompt,
      output,
      evaluation,
      // The hired agent's own price, not a flat per-modality constant —
      // different agents for the same modality now genuinely cost different
      // amounts (see the seed roster in src/lib/db.ts).
      costUsdc: agent.priceUsdc,
      generationWarning,
      videoStatus,
      videoJobId,
      videoPollingUrl,
      createdAt: new Date().toISOString(),
    });
  }

  return { batchId, records, selections: scouted.selections, combinationsEvaluated: scouted.combinationsEvaluated };
}

/**
 * Single-modality convenience wrapper — takes the candidate list for just
 * that one modality and still goes through the same scouting decision (a
 * budget with, say, 3 candidates for "image" still picks the best-affordable
 * one rather than assuming a single fixed agent).
 */
export async function runDirector(
  request: ContentRequest,
  candidates: CandidateAgent[]
): Promise<DirectorRecord> {
  const { records } = await runMultiDirector(
    { ...request, modalities: [request.modality] },
    { [request.modality]: candidates } as Partial<Record<ContentModality, CandidateAgent[]>>
  );
  return records[0];
}

export { AGENT_PRICE_USDC };
export type { CandidateAgent, ScoutSelection };
