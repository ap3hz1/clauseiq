export type PropertyType = "industrial" | "office" | "retail" | "mixed_use";
export type Province = "ON" | "BC" | "AB";

export type QuantMethod = "deterministic" | "actuarial" | "benchmarked" | "qualitative";
export type Confidence = "high" | "medium" | "low";
export type Favours = "landlord" | "tenant" | "neutral";
export type Recommendation = "accept" | "counter" | "reject";
export type RiskSignal = "manageable" | "material" | "significant";

export interface AnalysisInput {
  propertyType: PropertyType;
  province: Province;
  glaSqft: number;
  baseRentPsf: number;
  leaseTermYears: number;
  operatingCostPsf?: number;
}

export interface ChangeItem {
  id: string;
  clauseType: string;
  changeSummary: string;
  /** Base lease / struck text (required for persisted parser-driven rows). */
  originalText: string;
  /** Redline / inserted text (required for persisted parser-driven rows). */
  redlinedText: string;
  favours: Favours;
  impactLow: number | null;
  impactHigh: number | null;
  confidence: Confidence;
  method: QuantMethod;
  recommendation: Recommendation;
  userNotes?: string;
}

export interface AnalysisResult {
  id: string;
  status: "processing" | "complete" | "error";
  storageMode: "supabase" | "local-fallback";
  parserPath?: string;
  parserConfidence?: Confidence;
  analysisVersion?: string;
  totalChanges: number;
  totalImpactLow: number;
  totalImpactHigh: number;
  signal: RiskSignal;
  changes: ChangeItem[];
}
