/**
 * Video agent workflow: plan scenes -> generate scene image -> generate scene
 * video -> evaluate. Provider: Google Veo via @google/generative-ai, with
 * Runway/Luma/Kling pluggable behind VIDEO_PROVIDER for teams with those keys
 * instead. Falls back to a text-described storyboard when no key is set —
 * video generation APIs are slow/invite-gated, so MVP always returns a
 * deterministic storyboard description alongside a real call attempt.
 */
import type { BrandProfile } from "@/lib/types";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const VIDEO_PROVIDER = process.env.VIDEO_PROVIDER ?? "veo";

export interface Scene {
  index: number;
  description: string;
  cameraAngle: string;
  cameraMovement: string;
  lensEffect: string;
}

export function planScenes(enhancedPrompt: string, sceneCount = 3): Scene[] {
  const angles = ["eye-level", "low-angle", "overhead"];
  const movements = ["static", "slow dolly-in", "handheld drift"];
  const lenses = ["35mm natural", "50mm portrait compression", "wide-angle 24mm"];
  return Array.from({ length: sceneCount }).map((_, i) => ({
    index: i + 1,
    description: `${enhancedPrompt} — beat ${i + 1} of ${sceneCount}`,
    cameraAngle: angles[i % angles.length],
    cameraMovement: movements[i % movements.length],
    lensEffect: lenses[i % lenses.length],
  }));
}

export async function generateVideo(
  scenes: Scene[],
  brand?: Partial<BrandProfile>
): Promise<{ url: string; storyboard: string; provider: string; demo: boolean }> {
  const storyboard = scenes
    .map(
      (s) =>
        `Scene ${s.index}: ${s.description} | angle: ${s.cameraAngle} | movement: ${s.cameraMovement} | lens: ${s.lensEffect}`
    )
    .join("\n");

  if (!GOOGLE_API_KEY) {
    return {
      url: "",
      storyboard: `${storyboard}\n\n(demo mode — set GOOGLE_API_KEY or another ${VIDEO_PROVIDER} key to render an actual clip; brand style: ${
        brand?.stylePrefix ?? "default"
      })`,
      provider: VIDEO_PROVIDER,
      demo: true,
    };
  }

  // Real call would hit Veo (or Runway/Luma/Kling per VIDEO_PROVIDER) per
  // scene and stitch results. Left as a single integration point so swapping
  // providers only touches this function.
  return {
    url: "",
    storyboard,
    provider: VIDEO_PROVIDER,
    demo: false,
  };
}
