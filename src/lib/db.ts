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
  // before onchainAgentId was added — patch it in for any database created
  // by an earlier version of this file. Ignored if it's already there.
  await pool.query("ALTER TABLE agents ADD COLUMN IF NOT EXISTS onchainAgentId TEXT").catch(() => {});
  await pool
    .query("ALTER TABLE content_records ADD COLUMN IF NOT EXISTS reputationTxHash TEXT")
    .catch(() => {});
  await pool
    .query("ALTER TABLE content_records ADD COLUMN IF NOT EXISTS reputationWarning TEXT")
    .catch(() => {});

  const client: DbClient = {
    async get(sql, params = []) {
      const { rows } = await pool.query(toPgSql(sql), params);
      return rows[0];
    },
    async all(sql, params = []) {
      const { rows } = await pool.query(toPgSql(sql), params);
      return rows;
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

async function seedIfEmpty(db: DbClient) {
  const row = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM agents");
  if (row && Number(row.c) > 0) return;

  const now = new Date().toISOString();
  const demoAgents = [
    {
      name: "Nova Director",
      type: "director",
      description: "Plans budget-aware creative briefs and hires the right sub-agents.",
      model: "claude-orchestrator-v1",
      modality: "multi-modal",
      scope: "general",
      generationParadigm: "auto-regressive",
      capabilities: ["planning", "budget-optimization", "brand-analysis"],
      niche: "general marketing",
      score: 92,
      price: 0.05,
    },
    {
      name: "Lumen Frame",
      type: "image",
      description: "Multi-image composition and text rendering with strict brand-color adherence.",
      model: "imagen-brand-v2",
      modality: "unimodal",
      scope: "specialized",
      generationParadigm: "diffusion",
      capabilities: ["multi-image-composition", "multi-turn-generation", "text-rendering"],
      niche: "product photography",
      score: 88,
      price: 0.12,
    },
    {
      name: "Reel Runner",
      type: "video",
      description: "Scene-by-scene cinematic video generation with first/last frame control.",
      model: "veo-scene-v1",
      modality: "cross-modal",
      scope: "specialized",
      generationParadigm: "diffusion",
      capabilities: ["reference-to-video", "first-last-frame-control", "camera-language"],
      niche: "short-form social video",
      score: 84,
      price: 0.45,
    },
    {
      name: "Echo Voice",
      type: "audio",
      description: "Dialogue and sound-effect generation with a consistent voice profile.",
      model: "elevenlabs-voice-v1",
      modality: "unimodal",
      scope: "specialized",
      generationParadigm: "auto-regressive",
      capabilities: ["dialogue", "sound-effects", "voice-consistency"],
      niche: "podcast & narration",
      score: 81,
      price: 0.08,
    },
    {
      name: "Caption Wolf",
      type: "text",
      description: "Viral captions and platform-native copy for X, Reddit, LinkedIn.",
      model: "claude-copy-v1",
      modality: "unimodal",
      scope: "specialized",
      generationParadigm: "auto-regressive",
      capabilities: ["captioning", "social-copy", "hook-writing"],
      niche: "social growth",
      score: 90,
      price: 0.02,
    },
  ];

  for (let i = 0; i < demoAgents.length; i++) {
    const a = demoAgents[i];
    await db.run(
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
        i + 1,
        a.score,
        Math.floor(Math.random() * 400) + 20,
        a.price,
        null,
        now,
      ]
    );
  }
}
