/**
 * Text agent: prompt enhancement, captions, and platform-native social copy.
 * Provider: OpenRouter chat completions (same OPENROUTER_API_KEY as image.ts
 * and video.ts — one billing relationship for every modality). Previously
 * called Anthropic's API directly, but that repeatedly failed in production
 * with "Your credit balance is too low to access the Anthropic API" — a
 * per-project billing issue on Anthropic's own console, unrelated to this
 * app's code. Switching to OpenRouter sidesteps it the same way image/video
 * generation already did. Falls back to a deterministic template when
 * OPENROUTER_API_KEY is unset, so the pipeline is fully demoable offline.
 */
import type { BrandProfile } from "@/lib/types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// google/gemini-2.5-flash-lite: $0.10/$0.40 per 1M input/output tokens
// (openrouter.ai/google/gemini-2.5-flash-lite) — cheaper than gpt-4o-mini
// ($0.15/$0.60) with a much larger context window, plenty capable for prompt
// enhancement/copywriting/JSON-scoring at the token volumes this app uses
// (a few hundred tokens per call). Overridable via OPENROUTER_TEXT_MODEL if
// you want a different one — see openrouter.ai/models?output_modalities=text
// for the current list.
const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.5-flash-lite";

/** Builds a "Brand: ...; industry: ...; ..." context sentence, omitting any
 * field the creator left blank instead of printing "industry: ; audience: ;"
 * for every unset one — brand data is entirely optional (see the dashboard's
 * collapsed "Brand data (optional)" section), so most requests have none of
 * this set, and the previous version made every demo-mode fallback output
 * end in a wall of empty `field: ;` noise. */
function buildBrandContext(brand?: Partial<BrandProfile>): string {
  if (!brand) return "No brand context provided.";
  const parts = [
    brand.name && `Brand: ${brand.name}`,
    brand.industry && `industry: ${brand.industry}`,
    brand.targetAudience && `audience: ${brand.targetAudience}`,
    brand.goal && `goal: ${brand.goal}`,
    brand.emotion && `emotion to evoke: ${brand.emotion}`,
    brand.colors?.length && `colors: ${brand.colors.join(", ")}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join("; ")}.` : "No brand context provided.";
}

/** OpenRouter's top-level error.message is often a generic wrapper for a
 * failure that actually originated with the underlying provider — same
 * reasoning as image.ts/video.ts. Real detail (if captured) lives nested
 * under error.metadata. */
function extractOpenRouterError(json: unknown, fallback: string): string {
  const errObj = (json as { error?: { message?: string; metadata?: { raw?: unknown } } } | null)?.error;
  const rawDetail =
    typeof errObj?.metadata?.raw === "string"
      ? errObj.metadata.raw
      : errObj?.metadata?.raw
        ? JSON.stringify(errObj.metadata.raw)
        : undefined;
  return rawDetail || errObj?.message || fallback;
}

/** Shared OpenRouter chat-completions call, used by enhancePrompt/generateText
 * below and by evaluate.ts's LLM-as-judge scoring. Throws on any failure —
 * callers decide their own demo-mode fallback text, same pattern as
 * image.ts/video.ts. */
export async function callOpenRouterText(
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://west-creatives.vercel.app",
      "X-Title": "West Creatives",
    },
    body: JSON.stringify({
      model: OPENROUTER_TEXT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(extractOpenRouterError(json, `HTTP ${res.status}`));
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Model returned no content.");
  }
  return content.trim();
}

/** cleanErrorMessage is exported for callers (evaluate.ts, video.ts) that
 * want to strip a raw JSON-blob error string down to just the human
 * message — kept general-purpose since it's useful beyond text.ts's own
 * OpenRouter calls (e.g. video.ts's network-error catch blocks). */
export function cleanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "unknown error";
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return raw;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: { message?: string } };
    return parsed.error?.message ?? raw;
  } catch {
    return raw;
  }
}

export async function enhancePrompt(
  rawPrompt: string,
  brand?: Partial<BrandProfile>
): Promise<string> {
  const brandContext = buildBrandContext(brand);

  const demoFallback = `[enhanced] ${rawPrompt} — tuned for ${brand?.industry ?? "general"} audience, evoking ${
    brand?.emotion ?? "confidence"
  }.${brandContext !== "No brand context provided." ? ` ${brandContext}` : ""}`;

  if (!OPENROUTER_API_KEY) {
    return demoFallback;
  }

  try {
    const text = await callOpenRouterText(
      "You are a prompt-enhancement agent for a content generation pipeline. Given a raw creator prompt and brand context, rewrite it into a precise, production-ready creative brief. Be concise. Return only the enhanced brief.",
      `Raw prompt: "${rawPrompt}"\n${brandContext}`,
      400
    );
    return text;
  } catch (err) {
    // Never let a billing/quota/outage issue on the provider's side crash
    // the whole content-generation request.
    return `${demoFallback}\n\n(OpenRouter unavailable, used a demo enhancement instead: ${cleanErrorMessage(err)})`;
  }
}

export async function generateText(
  enhancedPrompt: string,
  brand?: Partial<BrandProfile>
): Promise<string> {
  const demoFallback = `${enhancedPrompt}\n\n(demo output) A punchy hook, three concrete value points, and a soft CTA tailored to ${
    brand?.targetAudience ?? "your audience"
  }.`;

  if (!OPENROUTER_API_KEY) {
    return demoFallback;
  }

  try {
    const text = await callOpenRouterText(
      "You are a viral copywriting agent. Write platform-native social copy or captions from the brief. No hashtags, no emojis, no markdown headers.",
      enhancedPrompt,
      600
    );
    return text;
  } catch (err) {
    return `${demoFallback}\n\n(OpenRouter unavailable, used a demo output instead: ${cleanErrorMessage(err)})`;
  }
}
