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
  failure classification. The Dashboard renders the actual generated output
  (not just its score) — inline image/audio/video preview plus a real
  download link, or the full text with a download-as-.txt link — both for
  the just-generated result and any past item in Content History
  ("View / download").
- **Payments & identity** — `src/lib/circle.ts` (wallets + nanopayment split),
  `src/lib/arc.ts` (ERC-8004 IdentityRegistry reads), `scripts/register-agent.ts`
  (onchain registration).
- **Data** — local SQLite via Node's built-in `node:sqlite` by default (no
  native build step, no external DB to stand up), or real Postgres (e.g.
  Railway) when `DATABASE_URL` is set — same code path either way (`src/lib/db.ts`).
  Auto-seeded with 5 demo agents on first run.

Every external integration (Circle, OpenRouter, ElevenLabs) has a demo
fallback, so `npm run dev` is fully clickable with zero keys. Add real keys to
go live incrementally — nothing needs to be wired all at once. This fallback
also covers the *real* key failing at runtime, not just being absent — e.g. a
provider account with a real key but a zero/negative credit balance, an
expired ElevenLabs key, or a transient network error. Every call site
in `src/lib/agents/` catches these and degrades to its demo-mode output
(with a note about what failed) rather than throwing an uncaught error up
into a generic 500 — a briefing shouldn't fail outright just because one
provider's billing lapsed.

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
| OpenRouter key (text/enhancement/evaluation + image + video generation) | openrouter.ai/keys — add prepaid credits at openrouter.ai/credits ($5-10 to start; default text model ~$0.10/$0.40 per 1M tokens, default image model ~$0.014-0.03/image, default video model ~$0.02/s, see `.env.example`) |
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

### Wallet card: balance + getting testnet USDC

The Dashboard's Wallet card shows the address (with a copy button) and its
live USDC balance, read directly from Arc Testnet (`getNativeUsdcBalance` in
`src/lib/arc.ts` — Arc's native gas token *is* USDC, so this is a plain,
unauthenticated RPC balance read, no Circle keys needed) with a manual
refresh button.

"Get testnet USDC" links out to faucet.circle.com. There's also an in-app
faucet call implemented (`requestFaucetDrip` in `src/lib/circle.ts`,
`POST /v1/faucet/drips`, gated behind `CIRCLE_API_KEY`) but it's **not wired
into the UI** — this project's API key gets a Forbidden response from that
endpoint, likely a plan/permission tier issue Circle's docs don't spell out.
The function and its route (`src/app/api/wallets/faucet/route.ts`) are still
there; swap the external link back to a real in-app request once a key with
faucet access confirms it actually works.

### Provisioning the seed agents (wallets + onchain identity)

The marketplace ships seeded with a director plus 2-3 sub-agents per content
type — 12 demo agents total (Nova Director; image: Lumen Frame, Grain &
Gloss, Halo Studio; video: Reel Runner, Cine Veo; audio: Echo Voice, Turbo
Teller, Flash Bark; text: Caption Wolf, Prose Baron, Deal Hacker), each with
its own real model and price (see the `demoAgents` array in `src/lib/db.ts` —
seeding is an upsert-by-name that runs on every boot, so editing that array
and restarting is enough to add/adjust an agent without a migration).
Agents ship with `walletAddress: null` and no onchain identity until you run
this once. Four steps, in order:

1. **Create their real Circle wallets:**
   ```bash
   node scripts/provision-seed-wallets.mjs
   ```
   Reads `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET` from `.env`, creates one
   real developer-controlled wallet per seed agent on Arc Testnet, and
   prints each agent's address. Update the `agentNames` array at the top of
   that script if you've added/renamed agents in `demoAgents`.

2. **Assign those addresses** to the matching agent rows (e.g. `UPDATE
   agents SET walletAddress = ? WHERE name = ?` per printed line, or a small
   one-off script) so every fresh environment — local, CI, Vercel — ends up
   with the same real, persistent addresses instead of generating throwaway
   ones.

3. **Seed the database** by starting the app once (`npm run dev`, load any
   page) — this inserts (or updates) every agent in `demoAgents` and
   assigns each a local database id.

4. **Register their onchain identity** on Arc Testnet's ERC-8004
   IdentityRegistry, all of them in one pass:
   ```bash
   npm run register-seed-agents
   ```
   For each agent this builds its own metadata (name, description, type,
   capabilities, model, niche, score, price) as a self-contained
   `data:application/json` URI — no IPFS pinning service or live domain
   needed — then calls `register(metadataURI)` via Circle's Contract
   Execution API (gas sponsored by Circle's Gas Station), polls until
   confirmed, and saves the minted tokenId back to that agent's
   `onchainAgentId` column. Safe to re-run: agents that already have an
   `onchainAgentId` are skipped, and one agent failing doesn't stop the
   others.

   To register a single agent instead (e.g. one a developer registers later
   from the Dashboard, not one of the seed agents):
   ```bash
   npm run register-agent -- --agentId=<id-from-agents-table>
   ```

Both registration commands require `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`
and print a dry-run plan (including a preview of the generated metadata)
without them.

**On "wallet keys":** Circle's developer-controlled wallets don't have a
separate private key per wallet that gets handed to you — Circle custodies
signing server-side, and access to *every* wallet created under your account
(including these 5) is governed entirely by the `CIRCLE_API_KEY` +
`CIRCLE_ENTITY_SECRET` pair already in your `.env`. Whoever holds those two
values controls all of it; there's nothing further to extract or hand over
per agent.

### Reputation & validation (ERC-8004)

**Reputation feedback is automatic.** Every time `/api/content/generate`
produces content for an agent that has an `onchainAgentId` (i.e. it's been
through the registration steps above), the app writes the LLM-as-judge
evaluation score onchain via ReputationRegistry's `giveFeedback()` — no extra
command needed. Per ERC-8004, an agent can't record reputation for itself, so
this is signed by a dedicated **platform validator wallet**
(`src/lib/platformWallet.ts`), created lazily on first use the same way any
other wallet in this app is (a row in `wallets`, keyed by the sentinel
ownerId `platform-validator`) — standing in for the platform's own evaluation
as the external observer the spec requires. This never blocks or fails a
content request: in demo mode, or if the write fails for any reason, the
result is just recorded as `reputationWarning` on the response and in
`content_records`, same fallback pattern as payment settlement.

**Validation is a two-step, on-demand flow** (an agent owner asking a
validator to review the agent, e.g. a quality/KYC-style check — not
something that fires automatically per request):

```bash
# Step 1 — agent owner wallet requests validation
npm run validate-agent -- request --agentId=<id-from-agents-table>

# Step 2 — validator wallet responds (100 = passed, 0 = failed)
npm run validate-agent -- respond --requestId=<id-printed-by-step-1>
```

By default the platform validator wallet plays the validator role in step 2
as well, so both steps work out of the box with just `CIRCLE_API_KEY` +
`CIRCLE_ENTITY_SECRET` set. Each request is tracked in a local `validations`
table (`requestHash`, both wallet addresses, both tx hashes) so `respond` can
look up everything it needs from the id `request` printed. Without Circle
keys, both subcommands print a dry-run plan and exit.

Read-only lookups against either registry: `resolveAgentIdentity()` /
`getValidationStatus()` in `src/lib/arc.ts` work with just an RPC connection
— no Circle keys needed — since they're plain contract view calls via
`viem`.

## Google sign-in (NextAuth)

`/signup` has a real "Google" button wired via NextAuth (`src/lib/auth.ts`,
`src/app/api/auth/[...nextauth]/route.ts`). It needs four env vars:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` (any random
string — generate one with `openssl rand -base64 32`), and `NEXTAUTH_URL`
(`http://localhost:3000` locally).

**Important:** `NEXTAUTH_URL` must be either a real URL or genuinely absent
— never present-but-blank. next-auth reads it at module load time (before
any page even renders) and only falls back to a default when the variable
is completely unset; an *empty string* value is treated as "set" and
crashes with `TypeError: Invalid URL`. This bit us in CI: referencing an
unconfigured GitHub secret via `${{ secrets.NEXTAUTH_URL }}` sets the env
var to `""`, not "undefined" — fixed in `.github/workflows/ci.yml` with a
`|| 'http://localhost:3000'` fallback. The same applies on Vercel: either
set `NEXTAUTH_URL` to your real deployed URL, or don't add the key at all
— don't add it with an empty value.

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
back to the seed agents. Railway's free Postgres plugin fixes that in about
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
   (Circle, OpenRouter, ElevenLabs, NextAuth, Resend, WalletConnect)
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

From here, every future `git push` to `main` auto-deploys — Vercel's own
GitHub integration handles this on its own, no GitHub Action involved.

## GitHub Actions

- `.github/workflows/ci.yml` — runs on every push/PR to `main`: installs and
  builds the project. Runs fine with zero secrets configured (demo-mode
  fallbacks), or add the same-named repo secrets to build against real keys.

There's no separate deploy workflow — Vercel's native GitHub integration
above already deploys on every push, so a second, Action-based path to the
same result would just be redundant.

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

- Audio generation returns a script in demo mode rather than a rendered file
  — real generation wires in the moment `ELEVENLABS_API_KEY` is set.
- Video generation is real (OpenRouter's async video API, see `.env.example`
  and `src/lib/agents/video.ts`), but since jobs take minutes to render, the
  content record comes back with a storyboard placeholder and `videoStatus:
  "pending"` — `src/app/api/content/video-status` is polled by the dashboard
  every ~8s until the job resolves, at which point the placeholder is
  replaced with the real video URL. Multi-scene stitching (right now each
  scene is planned but only the combined prompt is rendered as one clip) is
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
