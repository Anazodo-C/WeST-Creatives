/**
 * Evaluation layer: LLM-as-judge (Claude) + rubric-based scoring, producing a
 * radar chart of criteria and classifying failure type by modality so the
 * director agent knows where to focus a retry. SigLIP-style embedding
 * similarity is noted as a fast-follow (needs a hosted vision-embedding
 * model) rather than included in this MVP.
 */
import type { EvaluationResult, EvaluationFailureType } from "@/lib/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function getAnthropic() {
  if (!ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

export async function evaluateOutput(params: {
  modality: "text" | "image" | "video" | "audio";
  prompt: string;
  output: string;
}): Promise<EvaluationResult> {
  const client = await getAnthropic();
  const rubricCriteria = ["prompt-alignment", "brand-consistency", "quality", "originality"];

  if (!client) {
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
      feedback: "(demo evaluation) Set ANTHROPIC_API_KEY for real LLM-as-judge scoring.",
      failureType: score >= 65 ? "none" : (params.modality as EvaluationFailureType),
    };
  }

  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system:
      'You are an LLM-as-judge for generated content. Score the output 0-100 against the original prompt on these criteria: prompt-alignment, brand-consistency, quality, originality. Reply ONLY as JSON: {"scores": {"prompt-alignment": n, "brand-consistency": n, "quality": n, "originality": n}, "feedback": "one sentence", "failureType": "none|text|image|video|audio|brand-mismatch"}',
    messages: [
      {
        role: "user",
        content: `Modality: ${params.modality}\nPrompt: ${params.prompt}\nOutput: ${params.output}`,
      },
    ],
  });

  const block = msg.content.find((c) => c.type === "text");
  const raw = block && block.type === "text" ? block.text : "{}";

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
