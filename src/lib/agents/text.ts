/**
 * Text agent: prompt enhancement, captions, and platform-native social copy.
 * Provider: Anthropic Claude. Falls back to a deterministic template when
 * ANTHROPIC_API_KEY is unset, so the pipeline is fully demoable offline.
 */
import type { BrandProfile } from "@/lib/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

async function getAnthropic() {
  if (!ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

/** The Anthropic SDK's Error#message for an API error is literally
 * `"<status> <raw JSON body>"` (e.g. `400 {"type":"error","error":{"message":
 * "Your credit balance is too low..."}}`)  — readable enough in server logs,
 * but leaking that whole blob into user-facing generated content (captions,
 * video storyboards) looked like broken/garbled output. Pull out just the
 * human message when the error looks like that shape. */
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
  const client = await getAnthropic();
  const brandContext = buildBrandContext(brand);

  const demoFallback = `[enhanced] ${rawPrompt} — tuned for ${brand?.industry ?? "general"} audience, evoking ${
    brand?.emotion ?? "confidence"
  }.${brandContext !== "No brand context provided." ? ` ${brandContext}` : ""}`;

  if (!client) {
    return demoFallback;
  }

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      system:
        "You are a prompt-enhancement agent for a content generation pipeline. Given a raw creator prompt and brand context, rewrite it into a precise, production-ready creative brief. Be concise.",
      messages: [
        {
          role: "user",
          content: `Raw prompt: "${rawPrompt}"\n${brandContext}\n\nReturn only the enhanced brief.`,
        },
      ],
    });

    const block = msg.content.find((c) => c.type === "text");
    return block && block.type === "text" ? block.text.trim() : rawPrompt;
  } catch (err) {
    // Common causes: expired/invalid key, or a zero/negative Anthropic
    // account credit balance (a 400 invalid_request_error, not something
    // this SDK call retries) — never let a billing/quota issue on Anthropic's
    // side crash the whole content-generation request.
    return `${demoFallback}\n\n(Anthropic API unavailable, used a demo enhancement instead: ${cleanErrorMessage(
      err
    )})`;
  }
}

export async function generateText(
  enhancedPrompt: string,
  brand?: Partial<BrandProfile>
): Promise<string> {
  const client = await getAnthropic();
  const demoFallback = `${enhancedPrompt}\n\n(demo output) A punchy hook, three concrete value points, and a soft CTA tailored to ${
    brand?.targetAudience ?? "your audience"
  }.`;

  if (!client) {
    return demoFallback;
  }

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system:
        "You are a viral copywriting agent. Write platform-native social copy or captions from the brief. No hashtags, no emojis, no markdown headers.",
      messages: [{ role: "user", content: enhancedPrompt }],
    });

    const block = msg.content.find((c) => c.type === "text");
    return block && block.type === "text" ? block.text.trim() : enhancedPrompt;
  } catch (err) {
    return `${demoFallback}\n\n(Anthropic API unavailable, used a demo output instead: ${cleanErrorMessage(
      err
    )})`;
  }
}
