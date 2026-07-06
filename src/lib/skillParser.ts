/**
 * Best-effort extraction of agent metadata from an uploaded skill.md file —
 * lets a developer drop in the same kind of skill file used to brief an AI
 * agent (YAML frontmatter + markdown body describing what it does) and get
 * a pre-filled agent registration form instead of typing every field by
 * hand. Deliberately a *pre-fill*, not an auto-submit: extraction from free
 * text is inherently heuristic, so every field stays editable before the
 * developer actually registers the agent (see DeveloperDashboard.tsx).
 *
 * No dependencies (no real YAML parser, no markdown AST) — skill.md
 * frontmatter in practice is a flat `key: value` block, and the signals
 * this needs (name, description, bullet lists, keyword mentions) don't
 * need a real parser to extract reliably.
 */
import type { AgentType, Modality } from "@/lib/types";
import { MODELS_BY_TYPE } from "@/lib/models";

export interface ParsedSkillMetadata {
  name?: string;
  description?: string;
  model: string;
  modelGuessed: boolean;
  type: AgentType;
  modality: Modality;
  capabilities: string[];
}

const TYPE_KEYWORDS: Record<Exclude<AgentType, "director" | "custom">, string[]> = {
  image: ["image", "photo", "picture", "graphic", "illustration", "logo", "banner", "thumbnail", "artwork"],
  video: ["video", "clip", "film", "scene", "footage", "animation", "storyboard", "cinematic"],
  audio: ["audio", "voice", "speech", "sound", "music", "narration", "podcast", "tts", "voiceover"],
  text: ["text", "caption", "copy", "writing", "script", "blog", "article", "headline", "copywriting"],
  editing: ["edit", "editing", "retouch", "remix", "upscale", "restyle", "inpaint"],
};

// Sensible non-empty defaults per content type — used only when the
// skill.md doesn't state its own model explicitly, so the form never
// starts on a blank/invalid model string. Sourced from the same curated
// list src/lib/models.ts drives the registration form's model dropdown
// from, so this always defaults to the first (cheapest/most-used) known
// model for that type rather than maintaining a second, separate list
// that could drift out of sync with it.
const DEFAULT_MODEL_BY_TYPE: Record<AgentType, string> = Object.fromEntries(
  (Object.keys(MODELS_BY_TYPE) as AgentType[]).map((type) => [
    type,
    MODELS_BY_TYPE[type][0]?.id ?? "google/gemini-2.5-flash-lite",
  ])
) as Record<AgentType, string>;

/** Splits a skill.md file into its YAML-ish frontmatter block (if present)
 * and the remaining markdown body. Frontmatter is parsed as flat
 * `key: value` lines — good enough for the simple scalar fields skill.md
 * frontmatter actually uses (name, description, license), without pulling
 * in a real YAML parser for nested structures this doesn't need. */
function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (value) frontmatter[key] = value;
  }
  return { frontmatter, body: raw.slice(match[0].length) };
}

/** Extracts markdown bullet-list items (-, *, or "1.") from the body,
 * stripped of markdown emphasis markers, deduped, capped to 8 — used as
 * the agent's `capabilities`/operations list. */
function extractBullets(body: string): string[] {
  const items: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (!m) continue;
    const cleaned = m[1].replace(/[*_`]/g, "").trim();
    if (cleaned.length > 2 && cleaned.length < 80) items.push(cleaned);
  }
  return Array.from(new Set(items)).slice(0, 8);
}

/** Falls back to short verb-phrase fragments from the description when the
 * body has no bullet lists at all — still better than an empty
 * capabilities array. */
function fallbackCapabilitiesFromText(text: string): string[] {
  return text
    .split(/[,;.]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && s.length < 60)
    .slice(0, 5);
}

/** Scores each content-type bucket by keyword-mention count across the
 * whole document (frontmatter name/description + body), picks the winner.
 * Ties (or a genuine multi-category document — e.g. a skill that does both
 * image and video) get reported via `modality: "cross-modal"` rather than
 * an arbitrary pick between them. */
function inferTypeAndModality(fullText: string): { type: AgentType; modality: Modality } {
  const lower = fullText.toLowerCase();
  const scores = Object.entries(TYPE_KEYWORDS).map(([type, keywords]) => {
    const score = keywords.reduce((sum, kw) => {
      const matches = lower.match(new RegExp(`\\b${kw}\\b`, "g"));
      return sum + (matches?.length ?? 0);
    }, 0);
    return { type: type as AgentType, score };
  });

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];

  if (top.score === 0) {
    return { type: "text", modality: "unimodal" };
  }

  const tiedOrClose = scores.filter((s) => s.score > 0 && s.score >= top.score * 0.6);
  return {
    type: top.type,
    modality: tiedOrClose.length > 1 ? "cross-modal" : "unimodal",
  };
}

export function parseSkillFile(raw: string): ParsedSkillMetadata {
  const { frontmatter, body } = splitFrontmatter(raw);

  const name = frontmatter.name || frontmatter.title;
  // Prefer an explicit frontmatter description; otherwise use the first
  // non-empty, non-heading paragraph of the body as a description guess.
  const firstParagraph = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#"));
  const description = frontmatter.description || firstParagraph?.slice(0, 300);

  const fullText = [name, description, body].filter(Boolean).join("\n");

  // An explicit model mention, checked in two places: a `model: xyz` (or
  // `model = xyz`) frontmatter key — the most natural place a skill.md
  // author would put it — and, failing that, the same pattern anywhere in
  // the body text (e.g. under a "## Model" heading). frontmatter.model was
  // previously parsed by splitFrontmatter() but never actually read back
  // here, so a skill.md that only stated its model in frontmatter (as
  // opposed to inline body prose matching "model: xyz") silently fell back
  // to the type's generic default instead of the file's real model.
  const modelMatch = fullText.match(/\bmodel\s*[:=]\s*([a-z0-9._/-]+)/i);
  const explicitModel = frontmatter.model || modelMatch?.[1];

  const { type, modality } = inferTypeAndModality(fullText);

  const capabilities = extractBullets(body);
  const finalCapabilities = capabilities.length > 0 ? capabilities : fallbackCapabilitiesFromText(description ?? "");

  return {
    name,
    description,
    model: explicitModel ?? DEFAULT_MODEL_BY_TYPE[type],
    modelGuessed: !explicitModel,
    type,
    modality,
    capabilities: finalCapabilities,
  };
}
