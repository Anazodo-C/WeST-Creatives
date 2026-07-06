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
    // Common causes: expired/invalid key, or billing not enabled — Google's
    // pricing docs list NO free tier at all for gemini-2.5-flash-image, so a
    // key that works fine for text (ANTHROPIC_API_KEY-style free usage) can
    // still fail here specifically if the linked Google Cloud project has no
    // billing account attached. Logged (not just swallowed) so this is
    // actually diagnosable, plus surfaced as a warning on the result.
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
