/**
 * Curated shortlist of known-good models per agent type, used by the
 * developer registration form's model dropdown
 * (src/components/DeveloperDashboard.tsx) and as the fallback default when
 * a skill.md upload doesn't state a model explicitly (src/lib/skillParser.ts)
 * — one source of truth instead of two lists that could drift apart.
 *
 * These are the same model slugs this app's own generation pipeline
 * actually knows how to call (src/lib/agents/{image,video,audio,text}.ts)
 * or already runs live in the seed roster (src/lib/db.ts's demoAgents), not
 * an arbitrary catalog. Deliberately NOT exhaustive — OpenRouter alone
 * supports hundreds of models across every modality (including audio/TTS,
 * see openrouter.ai/collections/text-to-speech-models) — so the
 * registration form always keeps an "Other" escape hatch (a free-text
 * input) for any model slug not listed here. This file is a curated
 * shortlist to make the common case a dropdown, not a hard restriction on
 * what can be registered.
 *
 * Zero external/server-only dependencies (same pattern as pricing.ts), so
 * it's safe to import from both server code and client components.
 */
import type { AgentType } from "@/lib/types";

export interface ModelOption {
  id: string;
  label: string;
}

export const MODELS_BY_TYPE: Record<AgentType, ModelOption[]> = {
  image: [
    { id: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein 4B — fast & cheap (~$0.02/image)" },
    { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5 — cheap, alternate provider (~$0.04/image)" },
    { id: "openai/gpt-image-1", label: "GPT Image 1 — premium fidelity (~$0.10/image)" },
  ],
  video: [
    { id: "bytedance/seedance-2.0-fast", label: "Seedance 2.0 Fast — cheap & quick (~$0.02/s)" },
    { id: "google/veo-3.1", label: "Veo 3.1 — premium quality (~$0.63/s)" },
  ],
  audio: [
    { id: "google/gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS — premium, emotion tags, 70+ languages" },
    { id: "openai/gpt-4o-mini-tts-2025-12-15", label: "GPT-4o Mini TTS — balanced cost/quality" },
    { id: "hexgrad/kokoro-82m", label: "Kokoro 82M — lightweight, cheapest" },
  ],
  text: [
    { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — cheap, large context" },
    { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash — stronger copywriting" },
    { id: "deepseek/deepseek-v4-flash", label: "DeepSeek v4 Flash — cheapest" },
  ],
  editing: [
    { id: "openai/gpt-image-1", label: "GPT Image 1 — edit/inpaint capable" },
    { id: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein 4B — fast & cheap" },
  ],
  custom: [
    { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { id: "claude-orchestrator-v1", label: "Claude Orchestrator v1 (director-style)" },
  ],
  director: [{ id: "claude-orchestrator-v1", label: "Claude Orchestrator v1" }],
};

/** Sentinel value for the registration form's model <select> — chosen when
 * the developer wants (or a skill.md upload resolved to) a model slug that
 * isn't one of the curated options above. */
export const OTHER_MODEL_OPTION = "__other__";
