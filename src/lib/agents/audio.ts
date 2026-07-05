/**
 * Audio agent: dialogue + sound-effect generation via ElevenLabs, with a
 * consistent voice profile per brand. Falls back to a text script when
 * ELEVENLABS_API_KEY is unset.
 */
import type { BrandProfile } from "@/lib/types";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

export async function generateAudio(
  enhancedPrompt: string,
  brand?: Partial<BrandProfile>
): Promise<{ url: string; script: string; demo: boolean }> {
  const script = `[voice: ${
    brand?.voiceProfile ?? "neutral, confident"
  }] ${enhancedPrompt}`;

  if (!ELEVENLABS_API_KEY) {
    return { url: "", script, demo: true };
  }

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
        model_id: "eleven_multilingual_v2",
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
}
