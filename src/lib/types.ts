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
  /** Operating costs $/sqft/yr. If undefined and `operatingCostPsfEstimated` is true, system estimate is used. */
  operatingCostPsf?: number;
  /** True when the engine substituted a property-type system estimate for an unspecified value. */
  operatingCostPsfEstimated?: boolean;
  /** Discount rate used in NPV/PV calculations (PRD §6.1 — default 0.06, configurable). */
  discountRate?: number;
  /** Property address — shown on PDF cover (PRD §4.3). */
  propertyAddress?: string;
  /** Landlord party name — shown on PDF cover (PRD §4.3). */
  landlordParty?: string;
  /** Tenant party name — shown on PDF cover (PRD §4.3). */
  tenantParty?: string;
  /** Analyst name displayed on cover (PRD §4.3 — editable). */
  analystName?: string;
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
  /** User dismissed from the active register (excluded from totals and PDF). */
  dismissed?: boolean;
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
  /** Operating cost actually used (after system estimate fallback). */
  operatingCostPsfUsed?: number | null;
  /** True when the engine substituted a property-type system estimate. */
  operatingCostPsfEstimated?: boolean;
  /** Discount rate used in NPV/PV computations for this analysis. */
  discountRateUsed?: number;
}
