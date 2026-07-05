# West Creatives

Agentic content-creation marketplace: creators brief a personal director agent,
which hires image/video/audio/text agents built by developers, evaluates the
result, and settles a 90/10 USDC payment split gaslessly on Arc Testnet via
Circle Gateway (x402). Built for the Canteen x Lepton Hackathon.

## What's here

- **Frontend** — Next.js 15 (App Router) + Tailwind v4, dark/light theme
  toggle, neon green accents, Montserrat + a pixel display font for the
  animated tagline. Pages: landing, signup (creator/developer), dashboard,
  agents marketplace, analytics, docs, contact, roadmap, terms.
- **Wallet connect** — RainbowKit + wagmi targeting Arc Testnet (`src/lib/web3.ts`,
  `src/components/Web3Provider.tsx`), alongside Google sign-in via NextAuth.
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
| Resend key (contact form email) | resend.com |
| WalletConnect project id (optional) | cloud.walletconnect.com |

**Never commit `.env`.** It's already gitignored.

### Registering an agent onchain

After a developer registers an agent from the Dashboard (stored locally with
a Circle wallet), anchor its identity on Arc Testnet's ERC-8004 IdentityRegistry:

```bash
npm run register-agent -- --agentId=<id-from-agents-table>
```

Requires `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`. Prints a dry-run plan
without them.

### Provisioning real wallets for the 5 seed agents

The marketplace ships seeded with 5 demo agents (Nova Director, Lumen Frame,
Reel Runner, Echo Voice, Caption Wolf) with `walletAddress: null` until real
wallets are created for them. To give them real Arc Testnet wallets:

```bash
node scripts/provision-seed-wallets.mjs
```

This reads `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET` from `.env` and creates 5
real developer-controlled wallets, printing each agent's address. Paste those
addresses into the `demoAgents` array in `src/lib/db.ts` (replace the `null`
`walletAddress` fields) so every fresh environment — local, CI, Vercel — seeds
with the same real, persistent addresses instead of generating throwaway ones.

**On "wallet keys":** Circle's developer-controlled wallets don't have a
separate private key per wallet that gets handed to you — Circle custodies
signing server-side, and access to *every* wallet created under your account
(including these 5) is governed entirely by the `CIRCLE_API_KEY` +
`CIRCLE_ENTITY_SECRET` pair already in your `.env`. Whoever holds those two
values controls all of it; there's nothing further to extract or hand over
per agent.

## Google sign-in (NextAuth)

`/signup` has a real "Google" button wired via NextAuth (`src/lib/auth.ts`,
`src/app/api/auth/[...nextauth]/route.ts`). It needs four env vars:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` (any random
string — generate one with `openssl rand -base64 32`), and `NEXTAUTH_URL`
(`http://localhost:3000` locally).

In Google Cloud Console, on your OAuth 2.0 Client ID, add **both** of these
under Authorized redirect URIs (you can list more than one on the same
credential — no need for separate credentials per environment):

```
http://localhost:3000/api/auth/callback/google
https://<your-vercel-domain>/api/auth/callback/google
```

Add the matching Authorized JavaScript origins (`http://localhost:3000` and
your Vercel domain, no path).

## Deploying

Two ways to get this live — pick one:

**A. Vercel's GitHub integration (recommended, zero YAML to think about)**
Push this repo to GitHub (see below), then in Vercel: New Project → Import
your GitHub repo → add the environment variables from `.env.example` → Deploy.
Every future push to `main` auto-deploys, no GitHub Action needed for this part.

**B. Vercel CLI**
```bash
npm i -g vercel
vercel
```

Either way, add every variable from `.env.example` that you're using as a
Vercel Environment Variable (Project Settings → Environment Variables) —
anything left unset just runs in demo mode, which is safe but won't move real
funds, call real model APIs, or support real sign-in.

`node:sqlite` works on Vercel's Node runtime, but its filesystem is
ephemeral per deployment — fine for a hackathon demo, but swap in Postgres/
Turso/PlanetScale before this needs to persist across deploys.

## GitHub Actions

- `.github/workflows/ci.yml` — runs on every push/PR to `main`: installs and
  builds the project. Runs fine with zero secrets configured (demo-mode
  fallbacks), or add the same-named repo secrets to build against real keys.
- `.github/workflows/deploy.yml` — optional Vercel deploy via Action. Inert
  until you add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as repo
  secrets (run `vercel link` once locally to get the org/project IDs). Most
  people don't need this file at all — option A above (Vercel's native GitHub
  integration) does the same job with no secrets to manage.

## Marketplace visibility

Every creator gets a personal director agent at signup, but it's stored with
`visibility: "personal"` and is never listed in the public `/agents`
marketplace. The only director agent shown publicly is the shared
`platform-genesis-developer` one ("Nova Director") — that's the one used for
the guest trial path (Dashboard → "try it out as a guest, no account needed"),
so people can test the content engine before creating an account.

## Roadmap: agent-to-agent automation + agent social pages

`agents.xHandle` is already reserved in the schema (`src/lib/db.ts`) for a
planned feature where agents get their own X page and post completed work to
it automatically, alongside agent-to-agent hiring/payment (not just
creator-to-agent). This isn't built yet — it depends on a socials/agent-stack
spec that wasn't available when this pass was made. Share it and this becomes
the next slice of work.

## What's intentionally simplified for the hackathon cut

- Video/audio generation return a storyboard/script in demo mode rather than
  a rendered file — real generation wires in the moment `GOOGLE_API_KEY` /
  `ELEVENLABS_API_KEY` are set, but full multi-scene stitching and retries are
  a fast-follow, not MVP.
- SigLIP-style embedding similarity scoring is noted in `evaluate.ts` but not
  implemented — LLM-as-judge + rubric scoring covers evaluation for now.
- Google sign-in and wallet-connect (RainbowKit, targeting Arc Testnet) are
  both wired for real on `/signup` and in the nav.
- Brand profile data is captured per-request from the dashboard form rather
  than persisted as a reusable profile — add a `/api/brand` CRUD route backed
  by the existing `brand_profiles` table to close that loop.
- Agent-to-agent automation and per-agent X posting are schema-ready
  (`xHandle` column) but not implemented — see Roadmap above.
