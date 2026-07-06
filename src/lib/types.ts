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

export interface ContentRequest {
  prompt: string;
  modality: "text" | "image" | "video" | "audio";
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
  modality: "text" | "image" | "video" | "audio";
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
