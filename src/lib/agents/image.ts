/**
 * Image agent workflow: brand analysis -> design concept -> idea image -> evaluate.
 * Provider: Gemini's native image generation ("gemini-2.5-flash-image", aka
 * Nano Banana) via @google/genai, Google's current unified SDK. Falls back
 * to a placeholder data-URI description when GOOGLE_API_KEY is unset.
 *
 * IMPORTANT: this model's free tier is a hard 0 requests/day — every real
 * call fails with RESOURCE_EXHAUSTED immediately, no matter how little it's
 * used, unless the Google Cloud project behind GOOGLE_API_KEY has a billing
 * account attached. Generating a *new* key from the same unbilled project
 * hits the exact same wall — the limit is per-project, not per-key. Enable
 * billing at console.cloud.google.com (Billing) for whichever project
 * aistudio.google.com/apikey shows this key belongs to, or create a fresh
 * project with billing enabled first and generate the key from that one.
 * (Briefly swapped to fal.ai to sidestep this, then switched back per
 * request — if this starts failing again, that swap is the fallback.)
 */
import type { BrandProfile } from "@/lib/types";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

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

  if (!GOOGLE_API_KEY) {
    return placeholder();
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: compiledPrompt,
      // Required: without this, the model can (and often does) just answer
      // conversationally with text and no inlineData part at all — no error
      // thrown, it just silently never returns an image. Not documented as
      // a hard requirement anywhere on Google's page, but every non-trivial
      // official sample sets it, and its absence is the most common cause
      // of "real key set, still get the placeholder, no error in sight."
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const base64 = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType || "image/png";

    if (!base64) {
      // The call succeeded but returned no image bytes — most likely the
      // model responded with text only (safety refusal, or just chose not
      // to render an image for this prompt). Log the text it *did* return
      // so this is diagnosable from Vercel function logs instead of a
      // silent, unexplained placeholder.
      const textPart = response.candidates?.[0]?.content?.parts?.find((p) => p.text);
      const reason = textPart?.text?.slice(0, 200) || "Model returned no image data and no explanatory text.";
      console.error("[generateImage] no inlineData in response:", reason);
      return placeholder(`Gemini returned no image: ${reason}`);
    }

    return {
      url: `data:${mimeType};base64,${base64}`,
      description: compiledPrompt,
      demo: false,
    };
  } catch (err) {
    // Common causes: expired/invalid key, or billing not enabled — this
    // model's pricing page lists NO free tier at all, so a key that works
    // fine for other Google APIs can still fail here specifically if the
    // linked Google Cloud project has no billing account attached. err here
    // is typically an @google/genai ApiError whose .message already includes
    // the full raw API error JSON (code/status/quota details), so no extra
    // unwrapping is needed the way fal.ai's SDK required — just make sure
    // it's actually logged and surfaced, not swallowed.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generateImage] real Gemini call failed:", message);
    return placeholder(`Gemini image generation failed, used a placeholder instead: ${message}`);
  }
}

function placeholderSvg(label: string) {
  const safe = label.slice(0, 60).replace(/[<>&]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="100%" height="100%" fill="#111214"/>
    <rect x="20" y="20" width="760" height="760" fill="none" stroke="#39ff88" stroke-width="2"/>
    <text x="50%" y="50%" fill="#39ff88" font-family="monospace" font-size="20" text-anchor="middle">${safe}</text>
    <text x="50%" y="56%" fill="#9a9ba0" font-family="monospace" font-size="12" text-anchor="middle">placeholder — set GOOGLE_API_KEY for real generation</text>
  </svg>`;
}
