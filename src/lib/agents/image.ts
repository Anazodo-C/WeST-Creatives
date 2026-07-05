/**
 * Image agent workflow: brand analysis -> design concept -> idea image -> evaluate.
 * Provider: Google Imagen via @google/generative-ai. Falls back to a placeholder
 * data-URI description when GOOGLE_API_KEY is unset.
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

  if (!GOOGLE_API_KEY) {
    return {
      url: `data:image/svg+xml;utf8,${encodeURIComponent(
        placeholderSvg(attributes.subject)
      )}`,
      description: compiledPrompt,
      demo: true,
    };
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  // Imagen generation via Gemini API — model name per Google's current image
  // generation offering (imagen-3 / gemini image-preview family).
  const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-002" });
  const result = await model.generateContent(compiledPrompt);
  const response = result.response;
  const inlineData = response.candidates?.[0]?.content?.parts?.find(
    (p) => "inlineData" in p
  );
  const base64 = (inlineData as { inlineData?: { data?: string } } | undefined)
    ?.inlineData?.data;

  return {
    url: base64 ? `data:image/png;base64,${base64}` : "",
    description: compiledPrompt,
    demo: false,
  };
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
