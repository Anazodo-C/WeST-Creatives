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
- **Data** — local SQLite via Node's built-in `node:sqlite` by default (no
  native build step, no external DB to stand up), or real Postgres (e.g.
  Railway) when `DATABASE_URL` is set — same code path either way (`src/lib/db.ts`).
  Auto-seeded with 5 demo agents on first run.

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
| WalletConnect project id (optional) | cloud.reown.com |

**"Origin http://localhost:3000 not found on Allowlist"** — this comes from
`cloud.reown.com` (the WalletConnect Cloud dashboard, rebranded to Reown).
It means the app is running with either no project id, or a placeholder one
(`web3.ts` falls back to a dummy id so wallet connect still renders without
one). Injected wallets like MetaMask still work fine through this warning —
but to make it go away and unlock WalletConnect's QR/mobile flow: create a
free project at cloud.reown.com, then in that project's settings add both
`http://localhost:3000` and your deployed domain under **Allowed Origins**,
and put the project id in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `.env`.

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

## Database: Railway Postgres (recommended before deploying)

Locally, SQLite just works with zero setup — skip this section for `npm run
dev`. But Vercel's filesystem is wiped on every deploy, so if you deploy
without a real database, every push resets all agents/wallets/content history
back to the 5 seed agents. Railway's free Postgres plugin fixes that in about
two minutes:

1. Go to [railway.app](https://railway.app) → sign in (GitHub login is
   fastest) → **New Project** → **Provision PostgreSQL**.
2. Click into the new Postgres service → **Variables** tab → copy the value
   of `DATABASE_URL` (it looks like `postgresql://postgres:<password>@<host>.railway.app:<port>/railway`).
3. Paste it into your local `.env` as `DATABASE_URL=...` and restart `npm run
   dev` — the app will now read/write that Postgres database instead of the
   local SQLite file (it creates its tables and seeds the 5 demo agents
   automatically on first connect, same as SQLite does).
4. Add the same `DATABASE_URL` to Vercel (Project Settings → Environment
   Variables) before or after your first deploy — see below.

You do not need to run any app code *on* Railway — it's only hosting the
database here. The app itself still deploys to Vercel.

## Deploying to Vercel (first time)

1. **Push this repo to GitHub**, if you haven't yet:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```
   (Create the empty repo first at github.com/new — don't initialize it with
   a README/license, since this repo already has its own history.)

2. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New**
   → **Project** → select this repo from the list → **Import**.

3. Vercel auto-detects Next.js; leave the build settings as default.

4. Before clicking Deploy, open **Environment Variables** and add every key
   from `.env.example` that you actually have a value for — at minimum
   `DATABASE_URL` (from Railway above) so data persists. Everything else
   (Circle, Anthropic, Google, ElevenLabs, NextAuth, Resend, WalletConnect)
   is optional — anything left unset just runs in demo mode, which is safe
   but won't move real funds, call real model APIs, or support real sign-in.
   For `NEXTAUTH_URL`, use your Vercel domain (e.g.
   `https://west-creatives.vercel.app`) instead of `localhost`.

5. Click **Deploy**. First build takes ~1-2 minutes. You'll get a live URL
   when it finishes.

6. If you set up Google sign-in or WalletConnect, go back and add your new
   Vercel domain to their allowed redirect URIs / origins (see the Google
   sign-in and Reown sections above) — those are keyed to specific URLs, so
   they need updating after you know your real domain.

From here, every future `git push` to `main` auto-deploys — no extra setup,
and no GitHub Action needed for this part (that's what `.github/workflows/deploy.yml`
below is an alternative to, not something you need in addition to this).

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
