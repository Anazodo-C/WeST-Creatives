/**
 * Text agent: prompt enhancement, captions, and platform-native social copy.
 * Provider: Anthropic Claude. Falls back to a deterministic template when
 * ANTHROPIC_API_KEY is unset, so the pipeline is fully demoable offline.
 */
import type { BrandProfile } from "@/lib/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function getAnthropic() {
  if (!ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

export async function enhancePrompt(
  rawPrompt: string,
  brand?: Partial<BrandProfile>
): Promise<string> {
  const client = await getAnthropic();
  const brandContext = brand
    ? `Brand: ${brand.name ?? "unspecified"}; industry: ${brand.industry ?? "n/a"}; audience: ${
        brand.targetAudience ?? "n/a"
      }; goal: ${brand.goal ?? "n/a"}; emotion to evoke: ${brand.emotion ?? "n/a"}; colors: ${(
        brand.colors ?? []
      ).join(", ")}.`
    : "No brand context provided.";

  const demoFallback = `[enhanced] ${rawPrompt} — tuned for ${brand?.industry ?? "general"} audience, evoking ${
    brand?.emotion ?? "confidence"
  }. ${brandContext}`;

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
    return `${demoFallback}\n\n(Anthropic API unavailable, used a demo enhancement instead: ${
      err instanceof Error ? err.message : "unknown error"
    })`;
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
    return `${demoFallback}\n\n(Anthropic API unavailable, used a demo output instead: ${
      err instanceof Error ? err.message : "unknown error"
    })`;
  }
}
