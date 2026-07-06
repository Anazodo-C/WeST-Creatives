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
// Tried once more, on a different model+provider, if the primary model
// errors out or gets a bad prompt-adherence result — flux.2-klein-4b is
// OpenRouter's *cheapest* image model (its own docs describe it as
// optimized for speed/cost over fidelity), which explains both failure
// modes reported in practice: occasional provider-side errors, and images
// that don't closely match the prompt. Seedream 4.5 is still nanopayment-
// cheap (~$0.04/image) but a different provider/architecture entirely, so a
// transient outage or rejection on one rarely hits both at once.
const OPENROUTER_FALLBACK_IMAGE_MODEL =
  process.env.OPENROUTER_FALLBACK_IMAGE_MODEL || "bytedance-seed/seedream-4.5";

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

  // Try the primary (cheapest) model first, then one fallback on a
  // different model/provider if that fails — a single transient
  // provider-side error (or a persistently low-fidelity result from the
  // cheap model) shouldn't be the end of the attempt.
  const attempts = [OPENROUTER_IMAGE_MODEL, OPENROUTER_FALLBACK_IMAGE_MODEL].filter(
    (m, i, arr) => arr.indexOf(m) === i
  );

  let lastWarning = "";
  for (const model of attempts) {
    const result = await callOpenRouterImage(model, compiledPrompt);
    if (result.url) {
      return { url: result.url, description: compiledPrompt, demo: false };
    }
    lastWarning = result.warning;
    console.error(`[generateImage] ${model} failed:`, result.warning);
  }

  return placeholder(`OpenRouter image generation failed, used a placeholder instead: ${lastWarning}`);
}

async function callOpenRouterImage(
  model: string,
  compiledPrompt: string
): Promise<{ url?: string; warning: string }> {
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
        model,
        messages: [{ role: "user", content: compiledPrompt }],
        // Pure image-output models (FLUX, Seedream, Riverflow — including
        // this app's default, flux.2-klein-4b) only ever support
        // modalities: ["image"]; asking for "text" alongside it gets
        // rejected with "No endpoints found that support the requested
        // output modalities: image, text", since no FLUX-family endpoint
        // returns both. Multimodal chat-native models (Gemini image,
        // GPT-image) accept ["image"] alone too — they just won't bother
        // emitting accompanying text, which this app ignores anyway (only
        // the image is used below) — so ["image"] alone is the one setting
        // that works across every model family this could be pointed at.
        modalities: ["image"],
        // Caps OpenRouter's pre-request affordability check to a realistic
        // ceiling for one image instead of some models' full max output
        // (~65,536 tokens) — that uncapped default is what caused "requires
        // more credits" errors on a real, positive-but-modest balance.
        max_tokens: 4096,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      // OpenRouter's own top-level `error.message` is often a generic
      // wrapper (e.g. "Provider returned error") for failures that
      // actually originated with the underlying provider (FLUX/BFL,
      // Seedream, etc). The real detail — if OpenRouter captured one — is
      // nested under error.metadata: `raw` (the provider's own raw error
      // body/string), `provider_name`, `provider_code`, or `error_type`.
      // Surface whichever of those is present instead of the generic text.
      const errObj = json?.error as
        | { message?: string; metadata?: { raw?: unknown; provider_name?: string; provider_code?: string; error_type?: string } }
        | undefined;
      const metadata = errObj?.metadata;
      const rawDetail =
        typeof metadata?.raw === "string"
          ? metadata.raw
          : metadata?.raw
            ? JSON.stringify(metadata.raw)
            : undefined;
      const detail =
        rawDetail ||
        [metadata?.provider_name, metadata?.provider_code, metadata?.error_type].filter(Boolean).join(" ") ||
        errObj?.message ||
        `HTTP ${res.status}`;
      return { warning: `model ${model}: ${detail}` };
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
        typeof textContent === "string" && textContent ? textContent.slice(0, 200) : "model returned no image data.";
      return { warning: `model ${model}: no image returned — ${reason}` };
    }

    return { url, warning: "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { warning: `model ${model}: ${message}` };
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
