/**
 * Image agent workflow: brand analysis -> design concept -> idea image -> evaluate.
 * Provider: Gemini's native image generation ("gemini-2.5-flash-image", aka
 * Nano Banana) via @google/genai, Google's current unified SDK. Falls back
 * to a placeholder data-URI description when GOOGLE_API_KEY is unset.
 *
 * This used to call Imagen (imagen-3.0-generate-002) via the *old*,
 * deprecated @google/generative-ai SDK's generateContent() method — but
 * Imagen models were never callable through generateContent() (they need
 * the dedicated generateImages() method / a :predict REST endpoint, with a
 * completely different response shape: response.generatedImages[].image.
 * imageBytes, not candidates[].content.parts[].inlineData.data), and
 * imagen-3.0-generate-002 itself has since been shut down. So the "real"
 * branch here was broken even with a valid key — every real image request
 * was silently falling back to the placeholder. gemini-2.5-flash-image is
 * the model that actually matches the generateContent()/inlineData shape
 * this code expects, so switching to it (rather than switching methods to
 * chase Imagen) is the smaller, correct fix.
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
): Promise<{ url: string; description: string; demo: boolean }> {
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

  const placeholder = () => ({
    url: `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg(attributes.subject))}`,
    description: compiledPrompt,
    demo: true,
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
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const base64 = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType || "image/png";

    if (!base64) return placeholder();

    return {
      url: `data:${mimeType};base64,${base64}`,
      description: compiledPrompt,
      demo: false,
    };
  } catch {
    // Common causes: expired/invalid key, quota/billing exhausted, or image
    // generation not enabled for this API key/project — fall back to the
    // placeholder instead of failing the whole generation request.
    return placeholder();
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
