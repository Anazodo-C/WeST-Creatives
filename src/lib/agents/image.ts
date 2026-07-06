/**
 * Image agent workflow: brand analysis -> design concept -> idea image -> evaluate.
 * Provider: OpenRouter's OpenAI-compatible chat completions API — a plain
 * fetch() call, no SDK needed. Falls back to a placeholder data-URI
 * description when OPENROUTER_API_KEY is unset.
 *
 * Default model is black-forest-labs/flux.2-klein-4b: billed a flat rate per
 * output *megapixel* (~$0.014-0.03/image), not per token. That matters
 * because per-token Gemini/GPT-image models on OpenRouter (e.g. the
 * previously-used google/gemini-3.1-flash-lite-image) run an affordability
 * preflight against the model's *maximum possible* output_tokens (~65,536)
 * whenever max_tokens isn't capped — so a real, positive credit balance can
 * still get rejected with "This request requires more credits" even though
 * one image only needs a few thousand tokens. A flat per-image price has no
 * such preflight to trip. max_tokens is capped below regardless, so
 * switching OPENROUTER_IMAGE_MODEL back to a per-token model still works
 * without hitting that trap.
 *
 * Went through two other providers first, both dead ends:
 *  - Google's Gemini API called directly (gemini-2.5-flash-image via
 *    @google/genai): that model's free tier is a hard 0 requests/day — every
 *    call fails with RESOURCE_EXHAUSTED unless the Google Cloud project
 *    behind the key has its own billing account attached.
 *  - fal.ai (FLUX.1 dev): worked, but the account got locked for exhausted
 *    balance ("User is locked. Reason: Exhausted balance.").
 * OpenRouter sidesteps the Google billing-account problem specifically
 * because *they* hold the direct billing relationship with the underlying
 * provider — you only need prepaid OpenRouter credits, no Google Cloud
 * project/IAM setup on this app's side at all. Docs:
 * https://openrouter.ai/docs/features/multimodal/image-generation
 */
import type { BrandProfile } from "@/lib/types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || "black-forest-labs/flux.2-klein-4b";

interface ImagePromptAttributes {
  subject: string;
  action: string;
  location: string;
  composition: string;
  style: string;
  referenceImage?: string;
}

export function buildImageAttributes(
  enhancedPrompt: string,
  brand?: Partial<BrandProfile>
): ImagePromptAttributes {
  return {
    subject: enhancedPrompt,
    action: "presented in a clean, scroll-stopping hero composition",
    location: brand?.industry ? `${brand.industry} context` : "studio setting",
    composition: "camera controls: eye-level, shallow depth of field; soft key light with neon rim light",
    style: brand?.stylePrefix ?? "modern, high-contrast, brand-consistent",
    referenceImage: undefined,
  };
}

export async function generateImage(
  attributes: ImagePromptAttributes,
  brand?: Partial<BrandProfile>
): Promise<{ url: string; description: string; demo: boolean; warning?: string }> {
  const compiledPrompt = [
    attributes.subject,
    attributes.action,
    attributes.location,
    attributes.composition,
    `style: ${attributes.style}`,
    brand?.colors?.length ? `brand colors: ${brand.colors.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const placeholder = (warning?: string) => ({
    url: `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg(attributes.subject))}`,
    description: compiledPrompt,
    demo: true,
    warning,
  });

  if (!OPENROUTER_API_KEY) {
    return placeholder();
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // Optional attribution headers OpenRouter uses for their public
        // rankings/leaderboard — harmless to omit, but their docs recommend
        // setting them.
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://west-creatives.vercel.app",
        "X-Title": "West Creatives",
      },
      body: JSON.stringify({
        model: OPENROUTER_IMAGE_MODEL,
        messages: [{ role: "user", content: compiledPrompt }],
        // Required — without this the model responds as plain chat text
        // with no image at all, same trap as calling Gemini directly.
        modalities: ["image", "text"],
        // Caps OpenRouter's pre-request affordability check to a realistic
        // ceiling for one image + a short caption instead of the model's
        // full max output (~65,536 tokens for some Gemini variants) — that
        // uncapped default is what caused "requires more credits" errors on
        // a real, positive-but-modest balance.
        max_tokens: 4096,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const detail = json?.error?.message || `HTTP ${res.status}`;
      console.error("[generateImage] OpenRouter call failed:", detail);
      return placeholder(`OpenRouter image generation failed, used a placeholder instead: ${detail}`);
    }

    const images = json?.choices?.[0]?.message?.images as { image_url?: { url?: string } }[] | undefined;
    const url = images?.[0]?.image_url?.url;

    if (!url) {
      // The call succeeded but returned no image — most likely the model
      // responded with text only (safety refusal, or chose not to render
      // an image for this prompt). Log the text it did return so this is
      // diagnosable instead of a silent, unexplained placeholder.
      const textContent = json?.choices?.[0]?.message?.content;
      const reason =
        typeof textContent === "string" && textContent ? textContent.slice(0, 200) : "Model returned no image data.";
      console.error("[generateImage] no images in OpenRouter response:", reason);
      return placeholder(`OpenRouter returned no image: ${reason}`);
    }

    return {
      url, // already a data:image/...;base64,... URL per OpenRouter's response format
      description: compiledPrompt,
      demo: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generateImage] OpenRouter call failed:", message);
    return placeholder(`OpenRouter image generation failed, used a placeholder instead: ${message}`);
  }
}

function placeholderSvg(label: string) {
  const safe = label.slice(0, 60).replace(/[<>&]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="100%" height="100%" fill="#111214"/>
    <rect x="20" y="20" width="760" height="760" fill="none" stroke="#39ff88" stroke-width="2"/>
    <text x="50%" y="50%" fill="#39ff88" font-family="monospace" font-size="20" text-anchor="middle">${safe}</text>
    <text x="50%" y="56%" fill="#9a9ba0" font-family="monospace" font-size="12" text-anchor="middle">placeholder — set OPENROUTER_API_KEY for real generation</text>
  </svg>`;
}
