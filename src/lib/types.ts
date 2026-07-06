export type UserRole = "creator" | "developer";

export type AgentType =
  | "director"
  | "video"
  | "audio"
  | "image"
  | "text"
  | "editing"
  | "custom";

export type Modality = "unimodal" | "cross-modal" | "multi-modal";
export type Scope = "general" | "specialized";
export type GenerationParadigm = "auto-regressive" | "diffusion";

export interface AgentMetadata {
  id: string;
  name: string;
  developerId: string;
  description: string;
  type: AgentType;
  capabilities: string[];
  model: string;
  nicheSocialMedia?: string;
  nicheIndustry?: string;
  modality: Modality;
  scope: Scope;
  generationParadigm: GenerationParadigm;
  rank: number;
  score: number;
  transactionCount: number;
  priceUsdc: number;
  walletAddress?: string;
  createdAt: string;
}

export interface BrandProfile {
  id: string;
  ownerId: string;
  name: string;
  colors: string[];
  industry: string;
  targetAudience: string;
  goal: string;
  emotion: string;
  voiceProfile?: string;
  stylePrefix?: string;
}

// Named distinctly from AgentMetadata's `Modality` field above ("unimodal" |
// "cross-modal" | "multi-modal", describing an *agent's* modality shape) —
// this is the actual content type a creator is generating.
export type ContentModality = "text" | "image" | "video" | "audio";

export interface ContentRequest {
  prompt: string;
  modality: ContentModality;
  budgetUsdc: number;
  brand?: Partial<BrandProfile>;
  creatorId: string;
}

/** A single prompt fanned out to multiple sub-agents at once (e.g. "text and
 * image") — see src/lib/agents/director.ts's runMultiDirector. `modality`
 * above (ContentRequest) still exists for single-modality requests/callers;
 * runDirector() is now a thin wrapper over runMultiDirector with a
 * one-element modalities array, so both shapes produce identical results
 * for the single-modality case. */
export interface MultiContentRequest {
  prompt: string;
  modalities: ContentModality[];
  budgetUsdc: number;
  brand?: Partial<BrandProfile>;
  creatorId: string;
}

export type EvaluationFailureType =
  | "none"
  | "video"
  | "audio"
  | "image"
  | "text"
  | "brand-mismatch";

export interface EvaluationResult {
  score: number; // 0-100
  passed: boolean;
  radar: Record<string, number>;
  feedback: string;
  failureType: EvaluationFailureType;
}

export interface ContentRecord {
  id: string;
  creatorId: string;
  agentId: string;
  modality: ContentModality;
  // Shared by every record produced from the same submission — a
  // single-modality request gets a batch of one, a "text and image" request
  // gets two records with the same batchId, so the dashboard can group them
  // as one creative brief's worth of outputs. See runMultiDirector.
  batchId: string;
  prompt: string;
  enhancedPrompt: string;
  output: string;
  evaluation: EvaluationResult;
  costUsdc: number;
  developerShareUsdc: number;
  platformShareUsdc: number;
  // Set when the real generation call (currently just image.ts's Gemini
  // call) fell back to a demo placeholder — e.g. billing not enabled, the
  // model returned text instead of an image, or a network/auth error. Lets
  // the UI explain *why* the output is a placeholder instead of leaving it
  // unexplained.
  generationWarning?: string;
  // Set only for video content whose real render was submitted as an async
  // OpenRouter job (src/lib/agents/video.ts submitVideoJob) rather than
  // completed inline. "pending" until src/app/api/content/video-status's
  // polling flips it to "completed" (output becomes the real video URL) or
  // "failed" (output stays the storyboard text). Undefined for every other
  // modality, and for video generated in demo mode (no OPENROUTER_API_KEY).
  videoStatus?: "pending" | "completed" | "failed";
  videoJobId?: string;
  // Server-internal only — route.ts strips this before returning JSON to
  // the client. Needed so /api/content/video-status knows which OpenRouter
  // job to poll for a given content record id.
  videoPollingUrl?: string;
  createdAt: string;
}

export interface WalletInfo {
  id: string;
  address: string;
  blockchain: string;
  balanceUsdc: number;
  demo: boolean;
}

export interface Transaction {
  id: string;
  fromWallet: string;
  toWallet: string;
  amountUsdc: number;
  kind: "developer-payout" | "platform-fee" | "deposit" | "docking-fee";
  createdAt: string;
  txHash?: string;
}
