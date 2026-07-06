/**
 * Audio agent: dialogue + sound-effect generation via ElevenLabs, with a
 * consistent voice profile per brand. Falls back to a text script when
 * ELEVENLABS_API_KEY is unset.
 */
import type { BrandProfile } from "@/lib/types";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

/**
 * `preferredModelId` lets the director pass the specific audio sub-agent's
 * own ElevenLabs model (e.g. Echo Voice's eleven_multilingual_v2 vs Turbo
 * Teller's eleven_turbo_v2_5 vs Flash Bark's eleven_flash_v2_5) instead of
 * always using the same hardcoded model — see
 * src/lib/agents/director.ts's scoutAgents/runMultiDirector.
 */
export async function generateAudio(
  enhancedPrompt: string,
  brand?: Partial<BrandProfile>,
  preferredModelId: string = "eleven_multilingual_v2"
): Promise<{ url: string; script: string; demo: boolean }> {
  const script = `[voice: ${
    brand?.voiceProfile ?? "neutral, confident"
  }] ${enhancedPrompt}`;

  if (!ELEVENLABS_API_KEY) {
    return { url: "", script, demo: true };
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: script,
          model_id: preferredModelId,
        }),
      }
    );

    if (!res.ok) {
      return { url: "", script: `${script}\n\n(ElevenLabs error ${res.status})`, demo: true };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      url: `data:audio/mpeg;base64,${buf.toString("base64")}`,
      script,
      demo: false,
    };
  } catch (err) {
    // Network-level failure (DNS, timeout, etc.) rather than an HTTP error
    // status — same fallback either way.
    return {
      url: "",
      script: `${script}\n\n(ElevenLabs unavailable: ${err instanceof Error ? err.message : "unknown error"})`,
      demo: true,
    };
  }
}
