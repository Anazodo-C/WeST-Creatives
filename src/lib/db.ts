import { randomUUID } from "node:crypto";

/**
 * Database layer with two backends, chosen automatically:
 *
 *  - DATABASE_URL set (e.g. a Railway Postgres connection string) → real
 *    Postgres via `pg`, which persists across deploys/restarts.
 *  - DATABASE_URL unset → Node's built-in `node:sqlite` writing to a local
 *    file at .data/vibe.db. Zero setup, but on serverless hosts (Vercel)
 *    the filesystem is ephemeral per deployment, so this is meant for local
 *    dev only.
 *
 * Every call site uses the same small async interface (`get`/`all`/`run`)
 * with plain `?` placeholders in the SQL — this module rewrites them to
 * `$1, $2, ...` internally when talking to Postgres, so the two backends
 * are interchangeable from the caller's point of view.
 */

export interface DbClient {
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
}

const DATABASE_URL = process.env.DATABASE_URL;
export const DB_BACKEND: "postgres" | "sqlite" = DATABASE_URL ? "postgres" : "sqlite";

// Shared schema — plain, portable SQL (TEXT/INTEGER/REAL, IF NOT EXISTS)
// that both SQLite and Postgres accept as-is.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    developerId TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    capabilities TEXT,
    model TEXT,
    nicheSocialMedia TEXT,
    nicheIndustry TEXT,
    modality TEXT,
    scope TEXT,
    generationParadigm TEXT,
    rank INTEGER DEFAULT 0,
    score REAL DEFAULT 0,
    transactionCount INTEGER DEFAULT 0,
    priceUsdc REAL DEFAULT 0,
    walletAddress TEXT,
    -- 'public' = listed in the /agents marketplace. 'personal' = a
    -- creator's own director agent, never listed publicly.
    visibility TEXT DEFAULT 'public',
    -- Reserved for the agent-to-agent + social posting feature (agents get
    -- their own X page where completed work is posted) — schema is ready,
    -- posting automation is not yet wired (see README roadmap note).
    xHandle TEXT,
    -- ERC-8004 IdentityRegistry tokenId, set once npm run register-agent (or
    -- register-seed-agents) successfully mints this agent's onchain
    -- identity on Arc Testnet. NULL until then.
    onchainAgentId TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    delivered INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS content_records (
    id TEXT PRIMARY KEY,
    creatorId TEXT NOT NULL,
    agentId TEXT NOT NULL,
    modality TEXT NOT NULL,
    prompt TEXT,
    enhancedPrompt TEXT,
    output TEXT,
    evaluationJson TEXT,
    costUsdc REAL,
    developerShareUsdc REAL,
    platformShareUsdc REAL,
    -- ERC-8004 ReputationRegistry.giveFeedback() tx hash for this generation's
    -- evaluation score, once written onchain via the platform validator
    -- wallet (src/lib/platformWallet.ts). NULL in demo mode or if the write
    -- failed (see reputationWarning).
    reputationTxHash TEXT,
    reputationWarning TEXT,
    -- Testnet USDC debit equal to this record's real-dollar cost, moved from
    -- the platform's refill-reserve wallet to PLATFORM_WALLET_ADDRESS (see
    -- debitRefillReserve in src/lib/circle.ts). NULL in demo mode or if the
    -- reserve wallet isn't funded.
    reserveDebitTxHash TEXT,
    reserveDebitWarning TEXT,
    -- Set when real generation (currently just image.ts's Gemini call) fell
    -- back to a demo placeholder — see ContentRecord.generationWarning in
    -- src/lib/types.ts.
    generationWarning TEXT,
    -- Async video-job tracking (src/lib/agents/video.ts submitVideoJob +
    -- src/app/api/content/video-status/route.ts) — NULL for every
    -- non-video record, and for video generated in demo mode.
    videoJobId TEXT,
    videoPollingUrl TEXT,
    videoStatus TEXT,
    -- Groups every record produced from one submission — a single-modality
    -- request gets a batch of one, a "text and image" request shares one
    -- batchId across both records. See src/lib/agents/director.ts's
    -- runMultiDirector.
    batchId TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    fromWallet TEXT,
    toWallet TEXT,
    amountUsdc REAL,
    kind TEXT,
    createdAt TEXT NOT NULL,
    txHash TEXT
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    ownerId TEXT,
    address TEXT,
    blockchain TEXT,
    demo INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL
  );

  -- ERC-8004 ValidationRegistry request/response tracking. One row per
  -- validationRequest() call; requestTxHash/responseTxHash/response are
  -- filled in as scripts/validate-agent.ts progresses through the two-step
  -- flow (request from the agent owner wallet, response from the validator
  -- wallet). requestHash is the same bytes32 the onchain contract keys on,
  -- so getValidationStatus(requestHash) can always be cross-checked against
  -- this row.
  CREATE TABLE IF NOT EXISTS validations (
    id TEXT PRIMARY KEY,
    agentId TEXT NOT NULL,
    agentTokenId TEXT NOT NULL,
    requestHash TEXT NOT NULL,
    ownerWalletAddress TEXT,
    validatorWalletAddress TEXT,
    requestURI TEXT,
    requestTxHash TEXT,
    response INTEGER,
    responseTag TEXT,
    responseTxHash TEXT,
    createdAt TEXT NOT NULL,
    respondedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS brand_profiles (
    id TEXT PRIMARY KEY,
    ownerId TEXT,
    name TEXT,
    colors TEXT,
    industry TEXT,
    targetAudience TEXT,
    goal TEXT,
    emotion TEXT,
    voiceProfile TEXT,
    stylePrefix TEXT
  );
`;

/** Rewrite SQLite-style `?` placeholders to Postgres-style `$1, $2, ...`. */
function toPgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Every mixed-case column (and SELECT alias) referenced anywhere in this
 * codebase's raw SQL. Postgres folds *unquoted* identifiers to lowercase at
 * both CREATE TABLE time and query time — so a column declared/queried as
 * `priceUsdc` is physically stored as, and returned by node-postgres as,
 * `priceusdc`. SQLite preserves declared case exactly, so this mismatch is
 * Postgres-only, which is why it went unnoticed locally: every row read
 * through SQLite already has the right casing, and most existing call
 * sites either didn't read the affected fields (e.g. the old single-
 * agent-per-modality flow never read agents.priceUsdc/score at all) or
 * silently fell back to a default when a value came back `undefined`
 * (e.g. settlePaymentSplit's `agentRow.walletAddress ?? "0xdemoDeveloperWallet"`)
 * instead of throwing — so this was a real, live bug on Postgres deployments
 * well before it surfaced as a hard "NaN" budget error or the analytics
 * page's `undefined.toFixed()` crash.
 *
 * restorePgRowCasing runs on every row Postgres returns and copies each
 * known lowercase-folded key back onto its correct camelCase name (without
 * removing the lowercase key, so nothing that happened to read the
 * lowercase form directly keeps working too) — fixing this class of bug
 * globally, for every existing and future query, without needing to quote
 * every identifier in every SQL string throughout the app.
 */
const CAMEL_CASE_COLUMNS = [
  "developerId",
  "nicheSocialMedia",
  "nicheIndustry",
  "generationParadigm",
  "transactionCount",
  "priceUsdc",
  "walletAddress",
  "xHandle",
  "onchainAgentId",
  "createdAt",
  "creatorId",
  "agentId",
  "enhancedPrompt",
  "evaluationJson",
  "costUsdc",
  "developerShareUsdc",
  "platformShareUsdc",
  "reputationTxHash",
  "reputationWarning",
  "generationWarning",
  "videoJobId",
  "videoPollingUrl",
  "videoStatus",
  "batchId",
  "reserveDebitTxHash",
  "reserveDebitWarning",
  "fromWallet",
  "toWallet",
  "amountUsdc",
  "txHash",
  "ownerId",
  "agentTokenId",
  "requestHash",
  "ownerWalletAddress",
  "validatorWalletAddress",
  "requestURI",
  "requestTxHash",
  "responseTag",
  "responseTxHash",
  "respondedAt",
  "targetAudience",
  "voiceProfile",
  "stylePrefix",
  // SELECT aliases used in raw SQL (not physical columns, but hit the same
  // Postgres unquoted-identifier folding) — e.g.
  // src/app/api/content/history/route.ts's `a.name AS agentName`, and the
  // COUNT/SUM aliases in src/app/api/analytics/summary/route.ts.
  "agentName",
  "agentModel",
  "contentCount",
  "totalSpend",
  "developerEarnings",
  "platformRevenue",
] as const;

const LOWERCASE_TO_CAMEL = new Map(CAMEL_CASE_COLUMNS.map((c) => [c.toLowerCase(), c]));

function restorePgRowCasing<T extends Record<string, unknown>>(row: T): T {
  for (const [lower, camel] of LOWERCASE_TO_CAMEL) {
    if (lower === camel) continue;
    if (Object.prototype.hasOwnProperty.call(row, lower) && !(camel in row)) {
      (row as Record<string, unknown>)[camel] = row[lower];
    }
  }
  return row;
}

let _dbPromise: Promise<DbClient> | null = null;

export function getDb(): Promise<DbClient> {
  if (!_dbPromise) {
    _dbPromise = DATABASE_URL ? initPostgres(DATABASE_URL) : initSqlite();
  }
  return _dbPromise;
}

async function initPostgres(connectionString: string): Promise<DbClient> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    // Railway (and most managed Postgres hosts) terminate TLS with a cert
    // that Node's default chain won't validate — this is the standard
    // node-postgres workaround, same as Railway's own connection docs.
    ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });

  // Run the full multi-statement schema in one go (no params, so pg's
  // simple query protocol accepts the `;`-separated statements directly).
  await pool.query(SCHEMA_SQL);
  // CREATE TABLE IF NOT EXISTS is a no-op for tables that already existed
  // before these columns were added — patch them in for any database
  // created by an earlier version of this file. Every one of these used to
  // be its own awaited round trip (10+ in sequence, on top of the schema
  // query and seedIfEmpty's own round trips below) — since this whole init
  // path reruns on *every* cold start of *every* serverless function that
  // calls getDb() (each API route is its own Lambda with its own module
  // scope, so the module-level `_dbPromise` cache doesn't share across
  // routes), that serial chain was adding real, noticeable latency to
  // whichever page's requests happened to hit a cold function — which on
  // the dashboard means several routes at once (wallet, history, brand,
  // budget-recommendation, developer summary), unlike simpler pages that
  // touch the DB once or not at all. Batched into one multi-statement
  // query (all IF NOT EXISTS, so a column that already exists is just a
  // no-op, not an error) turns 9 round trips into 1.
  await pool
    .query(
      `
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS onchainAgentId TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS reputationTxHash TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS reputationWarning TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS generationWarning TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS videoJobId TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS videoPollingUrl TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS videoStatus TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS batchId TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS reserveDebitTxHash TEXT;
      ALTER TABLE content_records ADD COLUMN IF NOT EXISTS reserveDebitWarning TEXT;

      -- Reconciles agents.transactionCount against the real number of rows
      -- in content_records for that agent — the actual source of truth for
      -- "how many times has this agent genuinely been hired". Needed
      -- because seedIfEmpty() used to seed brand-new demo agents with a
      -- random placeholder transactionCount (Math.floor(Math.random() *
      -- 400) + 20) purely so the marketplace didn't look empty on first
      -- load — that random number then sat in the column indefinitely,
      -- since /api/content/generate's real per-request increment
      -- (transactionCount = transactionCount + 1) only ever added to
      -- whatever was already there. This UPDATE overwrites it with the
      -- genuine count every time this runs, so any inflated/stale value —
      -- past or future, from this bug or any other drift — self-corrects
      -- instead of needing a one-off manual fix. Cheap (a single
      -- correlated-subquery UPDATE over a small table) and safe to re-run
      -- on every cold start, unlike the sequential-round-trip problem the
      -- ALTER batch above solves for.
      UPDATE agents SET transactionCount = (
        SELECT COUNT(*) FROM content_records WHERE content_records.agentId = agents.id
      );
    `
    )
    .catch(() => {
      // Swallow rather than throw — every statement is IF NOT EXISTS (or, for
      // the transactionCount reconciliation below, safely re-runnable) so a
      // real failure here would mean the connection itself is broken, which
      // the very next query (seedIfEmpty, or the first real caller) will
      // surface clearly anyway.
    });

  const client: DbClient = {
    async get(sql, params = []) {
      const { rows } = await pool.query(toPgSql(sql), params);
      return rows[0] ? (restorePgRowCasing(rows[0]) as never) : undefined;
    },
    async all(sql, params = []) {
      const { rows } = await pool.query(toPgSql(sql), params);
      return rows.map((r) => restorePgRowCasing(r)) as never;
    },
    async run(sql, params = []) {
      await pool.query(toPgSql(sql), params);
    },
  };

  await seedIfEmpty(client);
  return client;
}

async function initSqlite(): Promise<DbClient> {
  const { DatabaseSync } = await import("node:sqlite");
  const path = await import("node:path");
  const fs = await import("node:fs");

  const DATA_DIR = path.join(process.cwd(), ".data");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "vibe.db"));
  db.exec(SCHEMA_SQL);
  // Same patch as the Postgres branch, for local .data/vibe.db files created
  // before onchainAgentId existed. SQLite has no "ADD COLUMN IF NOT EXISTS",
  // so just swallow the "duplicate column name" error if it's already there.
  try {
    db.exec("ALTER TABLE agents ADD COLUMN onchainAgentId TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN reputationTxHash TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN reputationWarning TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN generationWarning TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN videoJobId TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN videoPollingUrl TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN videoStatus TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN batchId TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN reserveDebitTxHash TEXT");
  } catch {
    // already exists — fine
  }
  try {
    db.exec("ALTER TABLE content_records ADD COLUMN reserveDebitWarning TEXT");
  } catch {
    // already exists — fine
  }

  // Same reconciliation as initPostgres above — see the comment there for
  // why this exists (seedIfEmpty() used to seed brand-new agents with a
  // random placeholder transactionCount that never got corrected). Cheap
  // enough to run unconditionally on every local dev restart too.
  db.exec(
    "UPDATE agents SET transactionCount = (SELECT COUNT(*) FROM content_records WHERE content_records.agentId = agents.id)"
  );

  const client: DbClient = {
    // node:sqlite's DatabaseSync is synchronous under the hood; wrapped in
    // `async` methods purely so callers use the same await-based API as
    // the Postgres backend. Row shapes are asserted by the caller via the
    // generic type param, same as the raw `.prepare().get()` calls used to.
    async get(sql, params = []) {
      return db.prepare(sql).get(...(params as never[])) as never;
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...(params as never[])) as never;
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...(params as never[]));
    },
  };

  await seedIfEmpty(client);
  return client;
}

/**
 * Platform-owned agent roster — one director plus 2-3 sub-agents per content
 * type, each backed by a genuinely different underlying model and priced
 * differently, so the director's budget-based selection (see
 * src/lib/agents/director.ts's scoutAgents) has real choices to make instead
 * of always picking the one agent that happens to exist per modality.
 *
 * Every `model` slug here is real and independently verified against
 * OpenRouter's own documentation/catalog (not guessed) before being wired
 * in — this codebase has been bitten twice already by invented/mistyped
 * model slugs (see image.ts's module comment and the seedream-4.5 fix), so
 * that verification step matters:
 *   - text: google/gemini-2.5-flash-lite, google/gemini-3.5-flash,
 *     deepseek/deepseek-v4-flash — all present in OpenRouter's public
 *     /api/v1/models catalog.
 *   - image: black-forest-labs/flux.2-klein-4b (already live in image.ts),
 *     bytedance-seed/seedream-4.5 (OpenRouter's own Image API doc's
 *     canonical example, $0.05/image), openai/gpt-image-1 (OpenRouter's
 *     other canonical image-generation doc example).
 *   - video: bytedance/seedance-2.0-fast (already live in video.ts),
 *     google/veo-3.1 (OpenRouter's own Video Generation doc's canonical
 *     example model, ~$0.50-0.75/video-second — a genuinely pricier,
 *     higher-quality tier, not just a relabeled duplicate).
 *   - audio: three distinct ElevenLabs model_ids (not OpenRouter — audio.ts
 *     calls ElevenLabs directly), each a real, stable ElevenLabs model:
 *     eleven_multilingual_v2 (quality narration), eleven_turbo_v2_5 (fast/
 *     cheap), eleven_flash_v2_5 (lowest-latency, cheapest).
 */
const demoAgents = [
  {
    name: "Nova Director",
    type: "director",
    description: "Plans budget-aware creative briefs and scouts the best sub-agents within budget.",
    model: "claude-orchestrator-v1",
    modality: "multi-modal",
    scope: "general",
    generationParadigm: "auto-regressive",
    capabilities: ["planning", "budget-optimization", "brand-analysis"],
    niche: "general marketing",
    score: 92,
    price: 0.05,
  },
  // ---- image ----
  {
    name: "Lumen Frame",
    type: "image",
    description: "Fast, cheap hero shots — best when volume matters more than fine detail.",
    model: "black-forest-labs/flux.2-klein-4b",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "diffusion",
    capabilities: ["fast-generation", "low-cost", "hero-composition"],
    niche: "product photography",
    score: 78,
    price: 0.02,
  },
  {
    name: "Grain & Gloss",
    type: "image",
    description: "Richer product photography with stronger prompt adherence, mid-tier cost.",
    model: "bytedance-seed/seedream-4.5",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "diffusion",
    capabilities: ["multi-image-composition", "prompt-adherence", "texture-detail"],
    niche: "product photography",
    score: 88,
    price: 0.05,
  },
  {
    name: "Halo Studio",
    type: "image",
    description: "Premium tier — sharp text-in-image rendering and character consistency.",
    model: "openai/gpt-image-1",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "diffusion",
    capabilities: ["text-rendering", "character-consistency", "multi-turn-generation"],
    niche: "brand campaigns",
    score: 95,
    price: 0.1,
  },
  // ---- video ----
  {
    name: "Reel Runner",
    type: "video",
    description: "Fast, cheap short-form social clips — good default for volume content.",
    model: "bytedance/seedance-2.0-fast",
    modality: "cross-modal",
    scope: "specialized",
    generationParadigm: "diffusion",
    capabilities: ["fast-generation", "low-cost", "camera-language"],
    niche: "short-form social video",
    score: 80,
    price: 0.45,
  },
  {
    name: "Cine Veo",
    type: "video",
    description: "Premium cinematic tier with synced audio — for hero/launch content.",
    model: "google/veo-3.1",
    modality: "cross-modal",
    scope: "specialized",
    generationParadigm: "diffusion",
    capabilities: ["cinematic-quality", "synced-audio", "reference-to-video"],
    niche: "brand launch video",
    score: 96,
    price: 2.5,
  },
  // ---- audio ----
  {
    name: "Echo Voice",
    type: "audio",
    description: "Natural narration and dialogue with a consistent voice profile.",
    model: "eleven_multilingual_v2",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "auto-regressive",
    capabilities: ["dialogue", "voice-consistency", "multilingual"],
    niche: "podcast & narration",
    score: 89,
    price: 0.08,
  },
  {
    name: "Turbo Teller",
    type: "audio",
    description: "Fast, cheap voiceover for quick social clips — lower fidelity than Echo Voice.",
    model: "eleven_turbo_v2_5",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "auto-regressive",
    capabilities: ["low-latency", "low-cost", "voiceover"],
    niche: "short-form social video",
    score: 76,
    price: 0.03,
  },
  {
    name: "Flash Bark",
    type: "audio",
    description: "Ultra-low-latency stingers and sound effects — cheapest audio tier.",
    model: "eleven_flash_v2_5",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "auto-regressive",
    capabilities: ["sound-effects", "ultra-low-latency", "low-cost"],
    niche: "podcast & narration",
    score: 70,
    price: 0.015,
  },
  // ---- text ----
  {
    name: "Caption Wolf",
    type: "text",
    description: "Viral captions and platform-native copy for X, Reddit, LinkedIn.",
    model: "google/gemini-2.5-flash-lite",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "auto-regressive",
    capabilities: ["captioning", "social-copy", "hook-writing"],
    niche: "social growth",
    score: 90,
    price: 0.02,
  },
  {
    name: "Prose Baron",
    type: "text",
    description: "Long-form brand storytelling and premium copywriting.",
    model: "google/gemini-3.5-flash",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "auto-regressive",
    capabilities: ["long-form-copy", "storytelling", "brand-voice"],
    niche: "brand campaigns",
    score: 93,
    price: 0.06,
  },
  {
    name: "Deal Hacker",
    type: "text",
    description: "Cheapest bulk-tier captions and ad-copy variations.",
    model: "deepseek/deepseek-v4-flash",
    modality: "unimodal",
    scope: "specialized",
    generationParadigm: "auto-regressive",
    capabilities: ["bulk-variations", "low-cost", "ad-copy"],
    niche: "social growth",
    score: 72,
    price: 0.01,
  },
];

async function seedIfEmpty(db: DbClient) {
  // Upsert by name (not just "insert if the table is fully empty", and not
  // just "insert if missing") so a database created by an earlier version
  // of this file — back when there was only one agent per content type, and
  // `model` was purely cosmetic — gets those existing rows' model/price/
  // description corrected too, not just gains the new sub-agents alongside
  // stale ones. That correction matters now: `model` used to be decorative
  // (every generation call used a fixed env-var model regardless of which
  // agent was picked), but scoutAgents/runMultiDirector now actually pass
  // the chosen agent's `model` into the real API call — a legacy row still
  // holding a placeholder string like "imagen-brand-v2" would silently fail
  // real generation for that specific agent otherwise. walletAddress,
  // onchainAgentId, and transactionCount are preserved on update since
  // those are per-deployment state, not part of the seed definition.
  const existing = await db.all<{ id: string; name: string }>(
    "SELECT id, name FROM agents WHERE developerId = 'platform-genesis-developer'"
  );
  const existingByName = new Map(existing.map((r) => [r.name, r.id]));

  const now = new Date().toISOString();
  let nextRank = existing.length;

  // Fired concurrently (Promise.all) rather than one-at-a-time — this used
  // to await each of the ~12 seed agents' UPDATE/INSERT in series, which on
  // Postgres (Railway) meant ~12 sequential network round trips on every
  // cold start of every serverless function that calls getDb() (see the
  // comment above the ALTER TABLE batch in initPostgres for why that's
  // significant). Each row here is independent — none of these need to
  // observe another's result mid-batch — so running them concurrently
  // against the connection pool turns that into roughly one round trip's
  // worth of wall-clock time instead of the sum of all of them. Rank for
  // new inserts is precomputed per-row (not a shared counter mutated
  // inside each concurrent task) to avoid a race on which insert gets
  // which rank.
  await Promise.all(
    demoAgents.map((a) => {
      const existingId = existingByName.get(a.name);
      if (existingId) {
        return db.run(
          `UPDATE agents SET description = ?, type = ?, capabilities = ?, model = ?, nicheIndustry = ?, modality = ?, scope = ?, generationParadigm = ?, score = ?, priceUsdc = ? WHERE id = ?`,
          [
            a.description,
            a.type,
            JSON.stringify(a.capabilities),
            a.model,
            a.niche,
            a.modality,
            a.scope,
            a.generationParadigm,
            a.score,
            a.price,
            existingId,
          ]
        );
      }

      const rank = ++nextRank;
      return db.run(
        `INSERT INTO agents (id, name, developerId, description, type, capabilities, model, nicheSocialMedia, nicheIndustry, modality, scope, generationParadigm, rank, score, transactionCount, priceUsdc, walletAddress, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          a.name,
          "platform-genesis-developer",
          a.description,
          a.type,
          JSON.stringify(a.capabilities),
          a.model,
          null,
          a.niche,
          a.modality,
          a.scope,
          a.generationParadigm,
          rank,
          a.score,
          // Genuinely zero, not a randomized placeholder — a freshly seeded
          // agent hasn't actually been hired yet. Previously this was
          // `Math.floor(Math.random() * 400) + 20`, a fake number meant to
          // make the marketplace look populated on first load, but it sat
          // in the column indefinitely (the real per-request increment in
          // /api/content/generate only ever added to it) and was never
          // reconciled against actual usage — see the transactionCount
          // reconciliation UPDATE in initPostgres/initSqlite above, which
          // now also self-corrects any already-inflated rows from before
          // this fix.
          0,
          a.price,
          null,
          now,
        ]
      );
    })
  );
}
