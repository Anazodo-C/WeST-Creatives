/**
 * Image agent workflow: brand analysis -> design concept -> idea image -> evaluate.
 * Provider: fal.ai, running FLUX.1 [dev] ("fal-ai/flux/dev") via the
 * @fal-ai/client SDK. Falls back to a placeholder data-URI description when
 * FAL_KEY is unset.
 *
 * Previously used Google's Gemini image model (gemini-2.5-flash-image) —
 * abandoned after confirming (via a real, billed-account-less API key) that
 * this model's free tier is a hard 0 requests/day: every real call returns
 * RESOURCE_EXHAUSTED immediately, regardless of usage, unless a Google Cloud
 * billing account is attached. Claude/Anthropic has no image-generation
 * capability at all, so it was never an option either. fal.ai's pay-as-you-go
 * pricing (~$0.025/megapixel for flux/dev, no forced GCP-style billing setup)
 * and small signup credit made it the more practical default here.
 */
import type { BrandProfile } from "@/lib/types";

const FAL_KEY = process.env.FAL_KEY;

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

  if (!FAL_KEY) {
    return placeholder();
  }

  try {
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: FAL_KEY });

    const result = await fal.subscribe("fal-ai/flux/dev", {
      input: {
        prompt: compiledPrompt,
        image_size: "square_hd",
        // Ask for a base64 data URI directly rather than a hosted CDN link,
        // so the output is fully self-contained in our own DB/response —
        // consistent with every other modality here — instead of depending
        // on fal's link staying reachable indefinitely. If a provider
        // response ever comes back as a hosted URL anyway (e.g. this flag
        // not being honored for some future model), the dashboard's output
        // renderer still handles that case too.
        sync_mode: true,
      },
      logs: false,
    });

    const image = (result.data as { images?: { url?: string; content_type?: string }[] })?.images?.[0];

    if (!image?.url) {
      console.error("[generateImage] fal.ai returned no image:", JSON.stringify(result.data).slice(0, 300));
      return placeholder("fal.ai returned no image data.");
    }

    return {
      url: image.url,
      description: compiledPrompt,
      demo: false,
    };
  } catch (err) {
    // Common causes: expired/invalid key, insufficient balance/credits, or
    // an unsupported input parameter for this model — logged (not just
    // swallowed) so this is actually diagnosable, plus surfaced as a
    // warning on the result.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generateImage] fal.ai call failed:", message);
    return placeholder(`fal.ai image generation failed, used a placeholder instead: ${message}`);
  }
}

function placeholderSvg(label: string) {
  const safe = label.slice(0, 60).replace(/[<>&]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="100%" height="100%" fill="#111214"/>
    <rect x="20" y="20" width="760" height="760" fill="none" stroke="#39ff88" stroke-width="2"/>
    <text x="50%" y="50%" fill="#39ff88" font-family="monospace" font-size="20" text-anchor="middle">${safe}</text>
    <text x="50%" y="56%" fill="#9a9ba0" font-family="monospace" font-size="12" text-anchor="middle">placeholder — set FAL_KEY for real generation</text>
  </svg>`;
}
