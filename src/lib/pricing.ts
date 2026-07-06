/**
 * Nanopayment-scale pricing per content-generation request — this is the
 * whole point of the app (Circle Gateway nanopayments/x402 for tiny,
 * per-request USDC charges), so prices here are set close to this app's
 * actual underlying provider cost per item, plus a small margin, rather
 * than arbitrary round numbers:
 *
 *   - text:  a few cents of Claude token usage at most (src/lib/agents/text.ts)
 *   - image: OpenRouter's flux.2-klein-4b, ~$0.014-0.03/image
 *            (src/lib/agents/image.ts)
 *   - video: still a storyboard stub, no real render yet
 *            (src/lib/agents/video.ts) — priced a bit ahead of the others
 *            since real video generation costs meaningfully more once wired up
 *   - audio: ElevenLabs' usage-based pricing for a short clip
 *            (src/lib/agents/audio.ts)
 *
 * Deliberately has zero external/server-only dependencies so it's safe to
 * import from both the server-side director (src/lib/agents/director.ts)
 * and the client-side dashboard form (src/app/dashboard/page.tsx) — the
 * latter uses it to default the budget field to the right amount per
 * content type instead of a flat guess.
 */
export const AGENT_PRICE_USDC: Record<"text" | "image" | "video" | "audio", number> = {
  text: 0.01,
  image: 0.03,
  video: 0.1,
  audio: 0.04,
};
