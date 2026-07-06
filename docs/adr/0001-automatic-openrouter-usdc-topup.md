# ADR-0001: Automatic USDC Refill for OpenRouter Credits

**Status:** On hold (see Update below) — Option C (x402) verified not actionable today
**Date:** 2026-07-06 (updated same day after Option C follow-up)
**Deciders:** West Creatives maintainer

## Context

Every sub-agent (text, image, video) now runs through OpenRouter, billed against a
prepaid OpenRouter credit balance. Today that balance is topped up manually. The
platform treasury itself holds USDC — on Arc Testnet today, Arc mainnet once it
launches (Circle's Arc mainnet is slated for summer 2026, i.e. concurrent with this
decision). The question: can the treasury's USDC automatically refill the OpenRouter
balance once it drops below a threshold, using Circle Gateway, CCTP, or some other
on-chain rail — with no human clicking a checkout page?

Two mechanisms are available to check the current balance programmatically
(`GET /api/v1/credits` returns `total_credits`/`total_usage`), so detecting "below
threshold" is not the hard part. Actually moving value into OpenRouter's ledger is.

## Decision

**Recommend Option C (switch to pay-per-call settlement via x402) as the primary
target, with Option B (fiat off-ramp into OpenRouter's native auto top-up) as a
fallback if x402 coverage isn't sufficient yet.** Do not build Option A — the
mechanism it depends on no longer exists.

## Research Findings (load-bearing — read before choosing an option)

- OpenRouter's only programmatic crypto top-up API (`POST /api/v1/credits/coinbase`,
  the legacy Coinbase Commerce charge flow) is **dead** — Coinbase deprecated the
  underlying APIs, and the endpoint now returns `410 Gone`. OpenRouter's own docs say
  to use the web credits page instead ("OpenRouter now uses Coinbase Business
  Checkouts for active Coinbase credit purchases") — a hosted checkout page, not an
  API a server can call unattended.
  (openrouter.ai/docs/cookbook/administration/crypto-api)
- OpenRouter does have a native **auto top-up** feature (replenish below a set
  threshold), but it's tied to a saved payment method through Stripe — i.e. fiat,
  not on-chain USDC.
- OpenRouter is **transitioning to the x402 protocol** for AI settlement — HTTP 402
  "Payment Required" turned into a real payment layer: a request gets a 402 + price,
  the caller signs a USDC payment, the server verifies and serves the response. No
  prepaid balance at all; the treasury wallet just needs to hold USDC and each call
  settles itself. This is reported as $50M+ processed industry-wide and growing, but
  OpenRouter's own rollout is described as "transitioning," not confirmed GA across
  every model/endpoint as of this writing. Several **OpenRouter-API-compatible
  x402 gateways already exist today** as drop-in replacements for OpenRouter's base
  URL (e.g. Router402 — same request/response shape, same model catalog access,
  billing is a per-call USDC micropayment on Base instead of a prepaid account).
- **Circle Gateway** (unified USDC balance, <500ms cross-chain access) is live in
  production on Arbitrum, Avalanche, Base, Ethereum, OP Mainnet, Polygon PoS, and
  Unichain. Arc's own listing is inconsistent across sources at the time of this
  research — one Gateway-specific page still shows Arc as "coming soon," while
  Circle's Arc materials describe Arc mainnet as bundling the full interop stack
  (USDC, CCTP, Gateway) from launch. **Verify directly against
  developers.circle.com/gateway's supported-chains list at build time** rather than
  trusting either secondhand claim.
- **CCTP v2** is mature and chain-agnostic (13+ mainnet chains as of April 2026:
  Ethereum, Avalanche, OP Mainnet, Arbitrum, Base, Polygon PoS, Solana, Sui, Aptos,
  Noble, Unichain, Linea, World Chain, Sonic, Codex), with Fast Transfer settling in
  8-20 seconds. It solves "move USDC from chain A to chain B" cleanly. It does
  **not** solve "turn USDC into OpenRouter credits" — that bridge is the same dead
  Coinbase Commerce API regardless of which chain the USDC lands on.

The practical implication: **Gateway and CCTP answer the wrong question.** They're
excellent at "get USDC to the right chain instantly," but the missing link was never
which chain the USDC sits on — it's that OpenRouter no longer exposes any
API to convert USDC into credits at all. Whatever chain you bridge to, you still hit
a hosted checkout page, not an endpoint.

## Options Considered

### Option A: Bridge USDC to a supported chain (Gateway or CCTP), then call
OpenRouter's Coinbase Commerce credits API

| Dimension | Assessment |
|-----------|------------|
| Complexity | N/A — blocked |
| Cost | N/A |
| Scalability | N/A |
| Team familiarity | High (this app already has Circle/CCTP-adjacent wallet code) |

**Pros:** Would have been the most direct match to the question as asked.
**Cons:** The specific API this depends on (`POST /api/v1/credits/coinbase`) is
permanently gone (`410 Gone`, Coinbase-side deprecation, not something OpenRouter can
un-deprecate). **Not buildable today.**

### Option B: Auto-refill via fiat off-ramp into OpenRouter's native (Stripe) auto
top-up

Flow: treasury wallet accumulates USDC from platform fees -> a scheduled job checks
`GET /api/v1/credits`, and separately off-ramps a slice of USDC to fiat via Circle's
business off-ramp/payout APIs into the bank account or card tied to OpenRouter's
auto top-up feature -> OpenRouter's own threshold-based auto top-up fires from there.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-high — off-ramp APIs need a verified Circle business account, banking details, and compliance (KYB) not currently part of this app's setup |
| Cost | Off-ramp fees + card processing fees on top of OpenRouter's own credit-purchase fee |
| Scalability | Fine once set up; each refill is a discrete transaction, easy to reason about |
| Team familiarity | Low — no off-ramp/payout code exists in this app yet |

**Pros:** Uses OpenRouter's actual supported auto top-up mechanism as intended;
no dependency on x402 maturing.
**Cons:** USDC leaves the crypto rail entirely (fiat hop), adds a real compliance
surface (business banking/KYB), and is arguably a worse philosophical fit for an app
whose whole thesis is on-chain nanopayments.

### Option C: Stop pre-funding a balance — pay per call via x402

Flow: point the app's OpenRouter client at an x402-compatible endpoint (OpenRouter's
own, once its rollout covers the models this app uses, or a compatible gateway like
Router402 in the meantime) backed by the platform's existing treasury wallet (or a
dedicated smart account funded from it). Each `generateText`/`generateImage`/
`submitVideoJob` call settles its own USDC micropayment at request time. `AGENT_PRICE_USDC`
(src/lib/pricing.ts) already prices per-call in USDC — this option makes the
*provider* payment match the *creator-facing* payment model instead of sitting behind
an unrelated prepaid abstraction.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — needs a funded smart account + request-signing (session keys via Pimlico/ZeroDev, per how x402 gateways typically work), but no threshold/scheduling logic at all |
| Cost | Per-call USDC, no separate top-up fee tier; gas is typically sponsored/rolled into the facilitator |
| Scalability | Scales naturally with usage — no "ran out mid-spike" failure mode a threshold-based refill could still miss |
| Team familiarity | Medium — this app already manages Circle wallets and contract calls (src/lib/circle.ts), so wallet/signing infrastructure isn't new, but x402's request-signing flow is |

**Pros:** Eliminates the refill problem architecturally rather than automating it —
there's no balance to run dry between polling intervals, no threshold to tune, no
partial-refill race condition mid-traffic-spike. Matches this app's own nanopayment
design (Circle Gateway/x402 nanopayments are literally the pitch in this app's own
README). Keeps everything in USDC, no fiat hop, no KYB/off-ramp compliance surface.
**Cons:** Depends on OpenRouter's x402 support being complete enough for the specific
models this app uses (verify current coverage before committing), or on trusting a
third-party facilitator's uptime/security if using a compatible gateway instead of
OpenRouter directly.

## Trade-off Analysis

Option A is not a real option — it's blocked by a provider-side deprecation with no
workaround, regardless of how quickly USDC can be moved across chains. This is worth
stating plainly since it directly contradicts the framing of the original question
(Gateway/CCTP were assumed to be the missing piece; they aren't).

Between B and C: B is the "smaller diff" from today's setup (same OpenRouter balance
model, just automate the refill), but trades a crypto-native architecture for a
fiat-hop with real compliance overhead. C is a larger initial lift (wallet/session-key
integration, verifying x402 coverage) but removes the refill problem entirely rather
than automating it, and is the better long-term fit given this app's own stated
nanopayment thesis.

## Consequences

- Choosing C means no more "is the balance below threshold" monitoring/alerting logic
  needed at all — `GET /api/v1/credits` becomes unnecessary for this purpose.
- Choosing C makes the treasury wallet's own USDC balance the only thing that ever
  needs monitoring (same wallet-balance-low problem this app already solves for
  creators via the dashboard's faucet link) — one unified "keep this wallet funded"
  concern instead of two.
- Choosing B means adding a genuinely new subsystem (off-ramp/payout, business
  banking) purely to keep a middleman balance topped up — worth revisiting once C's
  x402 coverage is confirmed sufficient.
- Either way, Option A's research isn't wasted: understanding Gateway/CCTP clearly
  rules out a plausible-sounding approach and should stop future proposals from
  re-treading it.

## Update: Option C follow-up (same day) — Router402 is not a usable target

Action item #1/#2 above were run down immediately. Result: **Option C is not
buildable against any real endpoint today**, for a more specific reason than
"OpenRouter's rollout is incomplete."

- Circle's own reference recipe (EOA wallet + `signTypedData`, confirmed real and
  working: `POST https://api.circle.com/v1/w3s/developer/sign/typedData`) produces a
  correct EIP-3009 `TransferWithAuthorization` signature per the x402 "exact" EVM
  scheme — genuinely solid, verified infrastructure.
- But **Router402 does not accept that signature directly.** Its actual documented
  integration surface (docs.router402.xyz) is: a human goes through Router402's own
  web app, creates a Pimlico-managed smart account, deposits USDC into *that*
  account via Router402's UI, and receives a JWT API key. Every subsequent API call
  is plain `Authorization: Bearer <jwt>` — structurally identical to calling
  OpenRouter today. The x402/session-key mechanics are entirely internal to
  Router402's own backend; there is no path for an external, self-controlled wallet
  (Circle-managed or otherwise) to hand Router402 a self-signed payment directly.
- OpenRouter itself still has no publicly documented, verifiable x402 endpoint for
  the models this app uses (only third-party commentary that it's "transitioning").

Net effect: the two concrete gateways this ADR could point at (OpenRouter directly,
Router402) both reduce back to "get an API key, hold a balance with a third party"
— the exact problem Option C was supposed to eliminate. Building the generic x402
client (Circle EOA + signTypedData) today would produce real, spec-compliant code
with **no compliant target to actually settle against** for this app's use case —
infrastructure with no current payoff.

**Decision: hold off entirely**, per direct confirmation from the maintainer.
Keep `OPENROUTER_API_KEY` as-is. Revisit if either of these changes:
- OpenRouter ships and documents a live x402 endpoint for
  google/gemini-2.5-flash-lite / black-forest-labs/flux.2-klein-4b /
  bytedance/seedance-2.0-fast (or their then-current equivalents), or
- A different x402-native gateway emerges that accepts an externally-signed
  payment directly (i.e. doesn't require onboarding through its own proprietary
  wallet/account system).

## Action Items

1. [x] Verify current x402 coverage on OpenRouter directly for the specific models
      this app defaults to — inconclusive from public docs; no confirmed live
      endpoint found.
2. [x] Evaluate Router402 as an interim target — ruled out; requires its own
      proprietary account/wallet onboarding, not a drop-in for a self-signed
      payment.
3. [ ] Not pursued (blocked by #2's finding): prototype smart-account session-key
      signing against the platform's treasury wallet.
4. [ ] Re-check developers.circle.com/gateway's supported-chains list once Arc
      mainnet is live, in case Option A's chain-bridging step becomes relevant for a
      *different* future integration (e.g. paying other non-OpenRouter vendors that
      do still accept direct on-chain USDC).
5. [ ] If pursuing Option B instead/additionally, scope Circle's business off-ramp
      API and KYB requirements before estimating effort.
6. [ ] Periodically re-check whether OpenRouter or a legitimate x402 gateway ships
      a genuinely external-wallet-compatible payment endpoint — this is the one
      finding that would reopen Option C.
