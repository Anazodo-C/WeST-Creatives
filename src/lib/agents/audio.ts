/**
 * Audio agent: dialogue + sound-effect generation via OpenRouter's
 * text-to-speech endpoint (POST /api/v1/audio/speech — see
 * openrouter.ai/docs/guides/overview/multimodal/tts), with a consistent
 * voice profile per brand. Falls back to a text script when
 * OPENROUTER_API_KEY is unset.
 *
 * Switched from calling ElevenLabs directly: OpenRouter's TTS endpoint
 * actually proxies several real providers (Google, OpenAI, hexgrad, and
 * others — see openrouter.ai/collections/text-to-speech-models), so this
 * consolidates audio onto the same OPENROUTER_API_KEY/billing relationship
 * already used for text/image/video generation (one prepaid balance, no
 * separate ElevenLabs signup/credits to manage) rather than a fourth,
 * independent provider account that can run out of credits on its own —
 * which is exactly what was happening before (ElevenLabs 402/
 * insufficient_credits).
 */
import type { BrandProfile } from "@/lib/types";
import { extractOpenRouterError } from "@/lib/agents/text";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// google/gemini-3.1-flash-tts-preview: the highest-quality tier (70+
// languages, inline emotion/delivery tags, multi-speaker support) — used
// as the module-level default so any caller that doesn't pass a specific
// agent's model still gets a real, capable voice. Overridable via
// OPENROUTER_AUDIO_MODEL.
const OPENROUTER_AUDIO_MODEL = process.env.OPENROUTER_AUDIO_MODEL || "google/gemini-3.1-flash-tts-preview";

/**
 * Voice identifiers are provider-specific — a `voice` value valid for one
 * TTS model is meaningless (or rejected) for another — so each of this
 * app's three real audio models needs its own verified voice id rather
 * than one hardcoded value reused everywhere:
 *   - google/gemini-3.1-flash-tts-preview: "Kore" — one of Google's 30
 *     documented Gemini TTS prebuilt voices, described as "Firm"; a good
 *     match for consistent narration/dialogue.
 *   - openai/gpt-4o-mini-tts-2025-12-15: "alloy" — OpenAI's standard,
 *     always-available TTS voice (the same one OpenRouter's own docs use
 *     in their basic example).
 *   - hexgrad/kokoro-82m: "af_heart" — Kokoro's documented default,
 *     warm/natural American-English voice out of its 54-voice set.
 * Falls back to "alloy" for any model not in this map (e.g. a developer-
 * registered agent on a different OpenRouter TTS model via the "Other"
 * option in the registration form) since it's the most broadly-supported
 * voice name across providers.
 */
const VOICE_BY_MODEL: Record<string, string> = {
  "google/gemini-3.1-flash-tts-preview": "Kore",
  "openai/gpt-4o-mini-tts-2025-12-15": "alloy",
  "hexgrad/kokoro-82m": "af_heart",
};

/**
 * `preferredModel` lets the director pass the specific audio sub-agent's
 * own OpenRouter TTS model (e.g. Echo Voice's Gemini TTS vs Turbo Teller's
 * GPT-4o Mini TTS vs Flash Bark's Kokoro) instead of always using the
 * module-level default — see src/lib/agents/director.ts's
 * scoutAgents/runMultiDirector.
 */
export async function generateAudio(
  enhancedPrompt: string,
  brand?: Partial<BrandProfile>,
  preferredModel: string = OPENROUTER_AUDIO_MODEL
): Promise<{ url: string; script: string; demo: boolean; warning?: string }> {
  const script = `[voice: ${
    brand?.voiceProfile ?? "neutral, confident"
  }] ${enhancedPrompt}`;

  if (!OPENROUTER_API_KEY) {
    return { url: "", script, demo: true };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://west-creatives.vercel.app",
        "X-Title": "West Creatives",
      },
      body: JSON.stringify({
        model: preferredModel,
        input: script,
        voice: VOICE_BY_MODEL[preferredModel] ?? "alloy",
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      // Per OpenRouter's TTS docs: non-200 responses return a normal JSON
      // error body (same shape as chat completions), not audio — only a
      // successful response is a raw byte stream.
      const json = await res.json().catch(() => null);
      const detail = extractOpenRouterError(json, `HTTP ${res.status}`);
      return {
        url: "",
        script,
        demo: true,
        warning: `OpenRouter audio generation failed, used a text script instead: ${detail}`,
      };
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
      script,
      demo: true,
      warning: `OpenRouter audio unavailable, used a text script instead: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }
}
