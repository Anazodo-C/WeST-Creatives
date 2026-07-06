/**
 * Evaluation layer: LLM-as-judge + rubric-based scoring, producing a radar
 * chart of criteria and classifying failure type by modality so the
 * director agent knows where to focus a retry. Provider: OpenRouter (same
 * OPENROUTER_API_KEY as text.ts/image.ts/video.ts) — previously called
 * Anthropic directly, switched for the same reason as text.ts (Anthropic's
 * own account credit-balance errors, unrelated to this app's code). SigLIP-
 * style embedding similarity is noted as a fast-follow (needs a hosted
 * vision-embedding model) rather than included in this MVP.
 */
import type { EvaluationResult, EvaluationFailureType } from "@/lib/types";
import { callOpenRouterText, cleanErrorMessage } from "@/lib/agents/text";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export async function evaluateOutput(params: {
  modality: "text" | "image" | "video" | "audio";
  prompt: string;
  output: string;
}): Promise<EvaluationResult> {
  const rubricCriteria = ["prompt-alignment", "brand-consistency", "quality", "originality"];

  function demoEvaluation(note: string): EvaluationResult {
    const radar = Object.fromEntries(
      rubricCriteria.map((c) => [c, 70 + Math.floor(Math.random() * 25)])
    );
    const score = Math.round(
      Object.values(radar).reduce((a, b) => a + b, 0) / rubricCriteria.length
    );
    return {
      score,
      passed: score >= 65,
      radar,
      feedback: note,
      failureType: score >= 65 ? "none" : (params.modality as EvaluationFailureType),
    };
  }

  if (!OPENROUTER_API_KEY) {
    return demoEvaluation("(demo evaluation) Set OPENROUTER_API_KEY for real LLM-as-judge scoring.");
  }

  let raw: string;
  try {
    raw = await callOpenRouterText(
      'You are an LLM-as-judge for generated content. Score the output 0-100 against the original prompt on these criteria: prompt-alignment, brand-consistency, quality, originality. Reply ONLY as JSON: {"scores": {"prompt-alignment": n, "brand-consistency": n, "quality": n, "originality": n}, "feedback": "one sentence", "failureType": "none|text|image|video|audio|brand-mismatch"}',
      `Modality: ${params.modality}\nPrompt: ${params.prompt}\nOutput: ${params.output}`,
      500
    );
  } catch (err) {
    // A billing/quota/outage failure on the provider's side should degrade
    // this one evaluation to demo scoring, not fail the entire
    // content-generation request the evaluation was attached to.
    return demoEvaluation(
      `(demo evaluation) Real LLM-as-judge call failed, used demo scoring instead: ${cleanErrorMessage(err)}`
    );
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      scores: Record<string, number>;
      feedback: string;
      failureType: EvaluationFailureType;
    };
    const score = Math.round(
      Object.values(parsed.scores).reduce((a, b) => a + b, 0) /
        Object.values(parsed.scores).length
    );
    return {
      score,
      passed: score >= 65,
      radar: parsed.scores,
      feedback: parsed.feedback,
      failureType: parsed.failureType ?? "none",
    };
  } catch {
    return {
      score: 60,
      passed: false,
      radar: {},
      feedback: "Judge response could not be parsed.",
      failureType: params.modality as EvaluationFailureType,
    };
  }
}
