# Vibe Marketplace

Agentic content-creation marketplace: creators brief a personal director agent,
which hires image/video/audio/text agents built by developers, evaluates the
result, and settles a 90/10 USDC payment split gaslessly on Arc Testnet via
Circle Gateway (x402). Built for the Canteen x Lepton Hackathon.

## What's here

- **Frontend** — Next.js 15 (App Router) + Tailwind v4, dark theme with neon
  green accents, Montserrat. Pages: landing, signup (creator/developer),
  dashboard, agents marketplace, analytics, docs, contact, roadmap, terms.
- **Content engine** — `src/lib/agents/` — director orchestrator + text/image/
  video/audio sub-agents + LLM-as-judge/rubric evaluation with per-modality
  failure classification.
- **Payments & identity** — `src/lib/circle.ts` (wallets + nanopayment split),
  `src/lib/arc.ts` (ERC-8004 IdentityRegistry reads), `scripts/register-agent.ts`
  (onchain registration).
- **Data** — local SQLite via Node's built-in `node:sqlite` (no native build
  step, no external DB to stand up). Auto-seeded with 5 demo agents on first run.

Every external integration (Circle, Anthropic, Google, ElevenLabs) has a demo
fallback, so `npm run dev` is fully clickable with zero keys. Add real keys to
go live incrementally — nothing needs to be wired all at once.

## Setup

```bash
npm install
cp .env.example .env      # fill in whichever keys you have — see below
npm run dev                # http://localhost:3000
```

The SQLite file is created automatically at `.data/vibe.db` on first request.

### Getting credentials

| Need | Where |
|---|---|
| Circle API key + Entity Secret | console.circle.com → Keys, and Wallets → Entity Secret registration |
| Arc Testnet USDC (for real transactions) | developers.circle.com/wallets/developer-console-faucet |
| Anthropic key | console.anthropic.com |
| Google API key (Imagen + Veo) | aistudio.google.com |
| ElevenLabs key | elevenlabs.io |

**Never commit `.env`.** It's already gitignored.

### Registering an agent onchain

After a developer registers an agent from the Dashboard (stored locally with
a Circle wallet), anchor its identity on Arc Testnet's ERC-8004 IdentityRegistry:

```bash
npm run register-agent -- --agentId=<id-from-agents-table>
```

Requires `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`. Prints a dry-run plan
without them.

## Deploying

This is a standard Next.js app — deploy to Vercel same as any other:

```bash
npm i -g vercel
vercel
```

Add every variable from `.env.example` that you're using as a Vercel
Environment Variable (Project Settings → Environment Variables) before your
first production deploy — the app runs in demo mode for anything left unset,
which is safe but won't move real funds or call real model APIs.

`node:sqlite` works on Vercel's Node runtime, but its filesystem is
ephemeral per deployment — fine for a hackathon demo, but swap in Postgres/
Turso/PlanetScale before this needs to persist across deploys.

## What's intentionally simplified for the hackathon cut

- Video/audio generation return a storyboard/script in demo mode rather than
  a rendered file — real generation wires in the moment `GOOGLE_API_KEY` /
  `ELEVENLABS_API_KEY` are set, but full multi-scene stitching and retries are
  a fast-follow, not MVP.
- SigLIP-style embedding similarity scoring is noted in `evaluate.ts` but not
  implemented — LLM-as-judge + rubric scoring covers evaluation for now.
- `/signup` collects a name/industry and creates a real Circle wallet; full
  Google OAuth (via NextAuth) and live wallet-connect are stubbed buttons —
  wire `GOOGLE_CLIENT_ID`/`SECRET` + a wallet connector (e.g. RainbowKit) to
  finish this.
- Brand profile data is captured per-request from the dashboard form rather
  than persisted as a reusable profile — add a `/api/brand` CRUD route backed
  by the existing `brand_profiles` table to close that loop.
