/**
 * Video agent workflow: plan scenes -> submit an async video-generation job.
 * Provider: OpenRouter's video generation API (POST /api/v1/videos, launched
 * April 2026 — https://openrouter.ai/docs/guides/overview/multimodal/video-generation),
 * the same billing account as this app's image generation
 * (src/lib/agents/image.ts), so no separate provider signup is needed if
 * OPENROUTER_API_KEY is already set.
 *
 * Real video jobs take *minutes* to render — OpenRouter's own docs describe
 * it as an async job you poll, not a synchronous call. That doesn't fit
 * inside one HTTP request/response (a Next.js route on Vercel would either
 * time out or hold the function open for minutes billing the whole time), so
 * this never waits for the result inline. It submits the job and returns
 * immediately with the planned storyboard as placeholder output, plus the
 * job's id/polling URL. Two independent things then watch for completion:
 *  - src/app/api/content/video-status/route.ts: a single status check per
 *    call, polled by the dashboard every ~8s *while a tab is open* — good
 *    for near-real-time UI updates.
 *  - src/app/api/content/video-webhook/route.ts: OpenRouter POSTs here the
 *    moment the job actually finishes (see callback_url below), so the DB
 *    record gets updated server-side even if nobody's watching the
 *    dashboard at that moment — closes the gap where polling depends on a
 *    browser tab staying open for the (multi-minute) render time.
 */
import type { BrandProfile } from "@/lib/types";
import { cleanErrorMessage } from "@/lib/agents/text";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// bytedance/seedance-2.0-fast: OpenRouter's cheapest/fastest video model as
// of mid-2026 (~$0.02/s of output), the same cheap-first-then-user-can-
// upgrade approach as image.ts's flux.2-klein-4b default. If this slug ever
// 404s (OpenRouter's catalog moves), check
// https://openrouter.ai/models?output_modalities=video for the current list
// and set OPENROUTER_VIDEO_MODEL to override.
const OPENROUTER_VIDEO_MODEL = process.env.OPENROUTER_VIDEO_MODEL || "bytedance/seedance-2.0-fast";
// Kept short (and thus cheap) by default — nanopayment pricing (see
// src/lib/pricing.ts) assumes a clip a few seconds long, not a full scene.
const VIDEO_DURATION_SECONDS = Number(process.env.OPENROUTER_VIDEO_DURATION_SECONDS || 4);

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

function buildStoryboard(scenes: Scene[]): string {
  return scenes
    .map(
      (s) =>
        `Scene ${s.index}: ${s.description} | angle: ${s.cameraAngle} | movement: ${s.cameraMovement} | lens: ${s.lensEffect}`
    )
    .join("\n");
}

export interface VideoJobResult {
  storyboard: string;
  jobId?: string;
  pollingUrl?: string;
  model?: string;
  warning?: string;
}

/** Plans the storyboard and, if OPENROUTER_API_KEY is set, submits it as a
 * real video-generation job. Never waits for the job to finish — see the
 * module comment above for why.
 *
 * `preferredModel` lets the director pass the specific video sub-agent's own
 * model (e.g. Reel Runner's cheap seedance-2.0-fast vs Cine Veo's premium
 * veo-3.1) instead of always using OPENROUTER_VIDEO_MODEL — see
 * src/lib/agents/director.ts's scoutAgents/runMultiDirector. */
export async function submitVideoJob(
  scenes: Scene[],
  brand?: Partial<BrandProfile>,
  preferredModel: string = OPENROUTER_VIDEO_MODEL
): Promise<VideoJobResult> {
  const storyboard = buildStoryboard(scenes);

  if (!OPENROUTER_API_KEY) {
    return {
      storyboard: `${storyboard}\n\n(demo mode — set OPENROUTER_API_KEY to render an actual clip; brand style: ${
        brand?.stylePrefix ?? "default"
      })`,
    };
  }

  const prompt = scenes.map((s) => s.description).join(" ");

  // OpenRouter requires the callback_url to be HTTPS — only send it when
  // NEXT_PUBLIC_APP_URL is actually set to an https:// deployment URL (never
  // true for local dev against http://localhost, which is fine: the
  // client-side polling in video-status/route.ts still works there).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const callbackUrl = appUrl?.startsWith("https://") ? `${appUrl}/api/content/video-webhook` : undefined;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://west-creatives.vercel.app",
        "X-Title": "West Creatives",
      },
      body: JSON.stringify({
        model: preferredModel,
        prompt,
        duration: VIDEO_DURATION_SECONDS,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      // Same reasoning as image.ts: OpenRouter's top-level error.message is
      // often a generic wrapper for a failure that actually originated with
      // the underlying provider — real detail (if captured) lives nested
      // under error.metadata.
      const errObj = json?.error as
        | { message?: string; metadata?: { raw?: unknown; provider_name?: string; provider_code?: string } }
        | undefined;
      const metadata = errObj?.metadata;
      const rawDetail =
        typeof metadata?.raw === "string" ? metadata.raw : metadata?.raw ? JSON.stringify(metadata.raw) : undefined;
      const detail =
        rawDetail ||
        [metadata?.provider_name, metadata?.provider_code].filter(Boolean).join(" ") ||
        errObj?.message ||
        `HTTP ${res.status}`;
      return {
        storyboard: `${storyboard}\n\n(video render failed to start, showing storyboard instead: ${detail})`,
        warning: `OpenRouter video job failed to start: ${detail}`,
      };
    }

    const jobId = json?.id as string | undefined;
    const pollingUrl =
      (json?.polling_url as string | undefined) ?? (jobId ? `https://openrouter.ai/api/v1/videos/${jobId}` : undefined);

    if (!jobId || !pollingUrl) {
      return {
        storyboard: `${storyboard}\n\n(video job did not return a trackable id, showing storyboard instead)`,
        warning: "OpenRouter video job response had no id/polling_url.",
      };
    }

    return {
      storyboard: `${storyboard}\n\n(video is rendering — usually a few minutes; this will update automatically once it's ready)`,
      jobId,
      pollingUrl,
      model: preferredModel,
    };
  } catch (err) {
    const message = cleanErrorMessage(err);
    return {
      storyboard: `${storyboard}\n\n(video render failed to start, showing storyboard instead: ${message})`,
      warning: `OpenRouter video job failed to start: ${message}`,
    };
  }
}

export interface VideoPollResult {
  status: "pending" | "completed" | "failed";
  url?: string;
  warning?: string;
}

/** A single status check against an in-flight OpenRouter video job — called
 * from src/app/api/content/video-status/route.ts, which is itself polled by
 * the dashboard every ~8s. Deliberately does not loop/sleep in-process: a
 * serverless function should return in milliseconds, not hold a job's
 * multi-minute render time as its own execution time. */
export async function pollVideoJob(pollingUrl: string): Promise<VideoPollResult> {
  if (!OPENROUTER_API_KEY) {
    return { status: "failed", warning: "OPENROUTER_API_KEY not set." };
  }

  try {
    const res = await fetch(pollingUrl, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const detail = json?.error?.message || `HTTP ${res.status}`;
      return { status: "failed", warning: `Video status check failed: ${detail}` };
    }

    const status = json?.status as string | undefined;

    if (status === "completed") {
      const url = json?.unsigned_urls?.[0] as string | undefined;
      if (!url) {
        return { status: "failed", warning: "Video job completed but returned no downloadable URL." };
      }
      return { status: "completed", url };
    }

    if (status === "failed" || status === "cancelled" || status === "expired") {
      return { status: "failed", warning: `Video job ended with status: ${status}` };
    }

    // "pending" / "running" / anything else in-progress.
    return { status: "pending" };
  } catch (err) {
    // A network hiccup mid-poll shouldn't permanently mark the job failed —
    // the dashboard just tries again on its next ~8s interval.
    return { status: "pending", warning: cleanErrorMessage(err) };
  }
}

export interface VideoWebhookResult {
  jobId: string;
  status: "completed" | "failed";
  url?: string;
  warning?: string;
}

/** Parses the payload OpenRouter POSTs to src/app/api/content/video-webhook
 * when a job reaches a terminal state (video.generation.completed/failed/
 * cancelled/expired — see the docs section this was built against:
 * openrouter.ai/docs/guides/overview/multimodal/video-generation#webhooks).
 * Returns null if the payload doesn't look like a recognizable video-job
 * event at all (e.g. some unrelated webhook hit this endpoint by mistake). */
export function interpretVideoWebhookPayload(payload: unknown): VideoWebhookResult | null {
  const data = (payload as { data?: { id?: string; status?: string; unsigned_urls?: string[]; error?: string } })
    ?.data;
  if (!data?.id || !data?.status) return null;

  if (data.status === "completed") {
    const url = data.unsigned_urls?.[0];
    if (!url) {
      return { jobId: data.id, status: "failed", warning: "Video job completed but returned no downloadable URL." };
    }
    return { jobId: data.id, status: "completed", url };
  }

  // failed / cancelled / expired are all terminal failures from this app's
  // point of view — the storyboard placeholder stays as the output.
  return { jobId: data.id, status: "failed", warning: data.error ?? `Video job ended with status: ${data.status}` };
}
