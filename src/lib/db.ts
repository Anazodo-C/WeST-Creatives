import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "vibe.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
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
  `);
  _db = db;
  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) as c FROM agents").get() as { c: number };
  if (row.c > 0) return;

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

  const insert = db.prepare(`
    INSERT INTO agents (id, name, developerId, description, type, capabilities, model, nicheSocialMedia, nicheIndustry, modality, scope, generationParadigm, rank, score, transactionCount, priceUsdc, walletAddress, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  demoAgents.forEach((a, i) => {
    insert.run(
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
      now
    );
  });
}
