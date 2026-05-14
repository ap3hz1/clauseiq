import type { AnalysisInput, ChangeItem, Confidence, QuantMethod } from "@/lib/types";
import { EXPECTED_RECOVERY_RATE, getDefaultRate } from "@/lib/actuarial";

export const DEFAULT_DISCOUNT_RATE = 0.06;

function resolveDiscount(input: AnalysisInput): number {
  const d = input.discountRate;
  if (typeof d === "number" && d > 0 && d < 0.25) return d;
  return DEFAULT_DISCOUNT_RATE;
}

export type ClauseType =
  | "CAM / Operating Cost Cap"
  | "Free Rent / Rent Abatement"
  | "Tenant Improvement Allowance"
  | "HVAC Capital Replacement Responsibility"
  | "Roof Replacement Contribution"
  | "Personal Guarantee Scope"
  | "Asphalt / Parking Lot Cap"
  | "Assignment and Subletting Rights"
  | "Renewal Option Terms"
  | "Structural Repair Responsibility"
  | "Operating Cost Exclusions"
  | "Demolition / Redevelopment Right"
  | "Insurance Requirements"
  | "Management Fee Cap";

export const MVP_CLAUSE_TYPES: readonly ClauseType[] = [
  "CAM / Operating Cost Cap",
  "Free Rent / Rent Abatement",
  "Tenant Improvement Allowance",
  "HVAC Capital Replacement Responsibility",
  "Roof Replacement Contribution",
  "Personal Guarantee Scope",
  "Asphalt / Parking Lot Cap",
  "Assignment and Subletting Rights",
  "Renewal Option Terms",
  "Structural Repair Responsibility",
  "Operating Cost Exclusions",
  "Demolition / Redevelopment Right",
  "Insurance Requirements",
  "Management Fee Cap"
];

/**
 * Topics intentionally OUT OF SCOPE for MVP quantification (PRD §5). Any
 * clause text matching these is flagged Qualitative and never gets a dollar
 * estimate, regardless of how a downstream classifier labels it.
 */
export const OUT_OF_SCOPE_TOPICS = [
  "Force Majeure",
  "Percentage Rent",
  "Ground Lease Structure",
  "Environmental Indemnity",
  "Landlord Default and Remedies"
] as const;
export type OutOfScopeTopic = (typeof OUT_OF_SCOPE_TOPICS)[number];

export function normalizeClauseType(raw: string): ClauseType | OutOfScopeTopic | "Unclassified Change" {
  const t = raw.trim();
  if ((MVP_CLAUSE_TYPES as readonly string[]).includes(t)) return t as ClauseType;
  if ((OUT_OF_SCOPE_TOPICS as readonly string[]).includes(t)) return t as OutOfScopeTopic;
  return "Unclassified Change";
}

function isOutOfScope(clauseType: string): clauseType is OutOfScopeTopic {
  return (OUT_OF_SCOPE_TOPICS as readonly string[]).includes(clauseType);
}

export type StructuralFacet = "cost_shift" | "gross_negligence" | "rent_abatement_trigger" | "termination_trigger";
export type RenewalFacet = "extra_term" | "notice_window" | "renewal_free_rent" | "rent_floor_removed";

export interface LeaseQuantFacts {
  freeRentMonths?: number | null;
  freeRentDeltaMonths?: number | null;
  freeRentClawbackRemoved?: boolean;
  tiDeltaPsf?: number | null;
  structuralFacet?: StructuralFacet;
  renewalFacet?: RenewalFacet;
  tenantProportionateShare?: number | null;
  assignmentProfitShareRemoved?: boolean;
  /** Personal Guarantee original term, in months (PRD §6.2 T_orig). */
  pgTOrigMonths?: number | null;
  /** Personal Guarantee proposed cap term, in months (PRD §6.2 T_cap). */
  pgTCapMonths?: number | null;
  /**
   * Classifier confidence tier for this row. If "low", PRD §10 forces the row
   * to qualitative regardless of clauseType. Pass-through from RAG/keywords.
   */
  classificationConfidence?: Confidence | null;
}

function npv(values: number[], discountRate: number): number {
  return values.reduce((acc, value, idx) => acc + value / (1 + discountRate) ** (idx + 1), 0);
}

function deterministicRange(base: number, lowMult = 0.9, highMult = 1.1) {
  return { low: Math.round(base * lowMult), high: Math.round(base * highMult) };
}

function widenBenchmarked(low: number, high: number, annualRent: number) {
  const mid = (low + high) / 2;
  let half = (high - low) / 2;
  const minHalf = Math.max(25_000, annualRent * 0.06);
  if (half < minHalf) half = minHalf;
  const minWidth = Math.max(annualRent * 0.05, (high - low) * 2);
  if (half * 2 < minWidth) half = minWidth / 2;
  return { low: Math.round(mid - half), high: Math.round(mid + half) };
}

function pvFreeRentDeltaMonths(monthly: number, deltaMonths: number, d: number): number {
  let s = 0;
  const mMax = Math.min(36, Math.max(0, deltaMonths));
  for (let m = 1; m <= mMax; m++) {
    s += monthly / (1 + d / 12) ** m;
  }
  return s;
}

const QUALITATIVE = {
  low: null,
  high: null,
  method: "qualitative" as const,
  confidence: "low" as const
};

export function estimateClauseImpact(clause: ClauseType, input: AnalysisInput, facts?: LeaseQuantFacts | null) {
  const annualRent = input.baseRentPsf * input.glaSqft;
  const opPsf = input.operatingCostPsf;
  if (opPsf == null) {
    return {
      ...QUALITATIVE,
      method: "qualitative" as const
    };
  }
  const annualOp = opPsf * input.glaSqft;
  const years = Math.max(1, Math.round(input.leaseTermYears));
  const d = resolveDiscount(input);

  switch (clause) {
    case "CAM / Operating Cost Cap": {
      const rCap = 0.03;
      const lowSeries = Array.from({ length: years }, (_, i) =>
        Math.max(0, annualOp * ((1 + 0.04) ** (i + 1) - (1 + rCap) ** (i + 1)))
      );
      const highSeries = Array.from({ length: years }, (_, i) =>
        Math.max(0, annualOp * ((1 + 0.06) ** (i + 1) - (1 + rCap) ** (i + 1)))
      );
      return {
        low: Math.round(npv(lowSeries, d)),
        high: Math.round(npv(highSeries, d)),
        method: "deterministic" as const,
        confidence: "high" as const
      };
    }
    case "Free Rent / Rent Abatement": {
      const monthly = annualRent / 12;
      if (facts?.freeRentClawbackRemoved) {
        return QUALITATIVE;
      }
      const dm = facts?.freeRentDeltaMonths;
      if (dm !== undefined && dm !== null) {
        if (dm <= 0) return QUALITATIVE;
        const pv = pvFreeRentDeltaMonths(monthly, dm, d);
        const range = deterministicRange(pv, 0.97, 1.04);
        return { ...range, method: "deterministic" as const, confidence: "high" as const };
      }
      const monthsFromLease = facts?.freeRentMonths;
      const m = Math.min(Math.max(1, monthsFromLease ?? 4), 36);
      const pv = Array.from({ length: m }, (_, i) => monthly / (1 + d / 12) ** (i + 1)).reduce((a, b) => a + b, 0);
      const range = deterministicRange(pv, 1, 1.05);
      const fromLease = monthsFromLease != null && !Number.isNaN(monthsFromLease);
      const confidence = fromLease ? ("high" as const) : ("medium" as const);
      return { ...range, method: "deterministic" as const, confidence };
    }
    case "Tenant Improvement Allowance": {
      if (facts?.tiDeltaPsf != null && facts.tiDeltaPsf > 0) {
        const delta = facts.tiDeltaPsf * input.glaSqft;
        return { ...deterministicRange(delta, 0.95, 1.05), method: "deterministic" as const, confidence: "high" as const };
      }
      return { ...deterministicRange(input.glaSqft * 8), method: "deterministic" as const, confidence: "medium" as const };
    }
    case "HVAC Capital Replacement Responsibility": {
      // Actuarial: expected replacement cost × probability of replacement event during lease term.
      // Lifespan ~15y, so per-year hazard ~1/15; probability across `years` ~ years/lifespan, capped at 1.
      const probReplacement = Math.min(1, years / 15);
      const replacementCost = input.glaSqft * 35;
      const expected = replacementCost * probReplacement;
      const sigma = expected * 0.3;
      return {
        low: Math.max(0, Math.round(expected - sigma)),
        high: Math.round(expected + sigma),
        method: "actuarial" as const,
        confidence: "medium" as const
      };
    }
    case "Roof Replacement Contribution": {
      // PRD §5: market $0.15–0.25/sqft/year × T × GLA. Tenant proposes contribution → delta vs landlord baseline.
      const lowAnnual = 0.15;
      const highAnnual = 0.25;
      return {
        low: Math.round(lowAnnual * years * input.glaSqft),
        high: Math.round(highAnnual * years * input.glaSqft),
        method: "actuarial" as const,
        confidence: "medium" as const
      };
    }
    case "Personal Guarantee Scope": {
      // PRD §6.2: Exposed = R × (T_orig − T_cap); Loss = Exposed × P_default × (1 − E_rec).
      // Low / Base / High at P_default ± 1σ from industry actuarial table.
      const tOrig = facts?.pgTOrigMonths;
      const tCap = facts?.pgTCapMonths;
      if (tOrig == null || tCap == null || tOrig <= tCap) {
        return QUALITATIVE;
      }
      const monthlyRent = annualRent / 12;
      const exposedRent = monthlyRent * (tOrig - tCap);
      const rate = getDefaultRate(input.propertyType);
      const pLow = Math.max(0, rate.pDefault - rate.sigma);
      const pHigh = rate.pDefault + rate.sigma;
      const recoveryFactor = 1 - EXPECTED_RECOVERY_RATE;
      return {
        low: Math.round(exposedRent * pLow * recoveryFactor),
        high: Math.round(exposedRent * pHigh * recoveryFactor),
        method: "actuarial" as const,
        confidence: "medium" as const
      };
    }
    case "Asphalt / Parking Lot Cap": {
      // Treat like CAM cap: uncapped vs cap on tenant share of parking lot OpEx.
      const lotPsf = 0.45;
      const rCap = 0.03;
      const baseAnnual = lotPsf * input.glaSqft;
      const lowSeries = Array.from({ length: years }, (_, i) =>
        Math.max(0, baseAnnual * ((1 + 0.04) ** (i + 1) - (1 + rCap) ** (i + 1)))
      );
      const highSeries = Array.from({ length: years }, (_, i) =>
        Math.max(0, baseAnnual * ((1 + 0.06) ** (i + 1) - (1 + rCap) ** (i + 1)))
      );
      return {
        low: Math.round(npv(lowSeries, d)),
        high: Math.round(npv(highSeries, d)),
        method: "deterministic" as const,
        confidence: "medium" as const
      };
    }
    case "Assignment and Subletting Rights": {
      if (facts?.assignmentProfitShareRemoved) {
        const gapLow = input.baseRentPsf * 0.05;
        const gapHigh = input.baseRentPsf * 0.35;
        const pEvent = 0.15;
        const lostShare = 0.5;
        const low = gapLow * input.glaSqft * pEvent * lostShare;
        const high = gapHigh * input.glaSqft * pEvent * lostShare;
        const w = widenBenchmarked(low, high, annualRent);
        return { ...w, method: "benchmarked" as const, confidence: "medium" as const };
      }
      const base = deterministicRange(annualRent * 0.12, 0.6, 1.4);
      const w = widenBenchmarked(base.low, base.high, annualRent);
      return { ...w, method: "benchmarked" as const, confidence: "medium" as const };
    }
    case "Renewal Option Terms": {
      const rf = facts?.renewalFacet;
      if (rf === "extra_term") {
        const optionValue = annualRent * 0.22 * 5 * 0.2;
        return { ...deterministicRange(optionValue, 0.92, 1.08), method: "deterministic" as const, confidence: "high" as const };
      }
      if (rf === "notice_window") return QUALITATIVE;
      if (rf === "renewal_free_rent") {
        const monthly = annualRent / 12;
        const y = Math.max(1, input.leaseTermYears);
        const pv = (monthly * 2) / (1 + d) ** y;
        return { ...deterministicRange(pv, 0.94, 1.06), method: "deterministic" as const, confidence: "medium" as const };
      }
      if (rf === "rent_floor_removed") {
        const low = annualRent * years * 0.1;
        const high = annualRent * years * 0.22;
        const w = widenBenchmarked(low, high, annualRent);
        return { ...w, method: "benchmarked" as const, confidence: "medium" as const };
      }
      return { ...deterministicRange(annualRent * 0.2), method: "deterministic" as const, confidence: "medium" as const };
    }
    case "Structural Repair Responsibility": {
      const sf = facts?.structuralFacet;
      if (sf === "gross_negligence" || sf === "rent_abatement_trigger" || sf === "termination_trigger") {
        return QUALITATIVE;
      }
      if (sf === "cost_shift") {
        const tps = facts?.tenantProportionateShare ?? 0.13;
        const annualStructuralPerSf = 2.8;
        const exposure = tps * annualStructuralPerSf * input.glaSqft * years;
        return { ...deterministicRange(exposure, 0.82, 1.12), method: "deterministic" as const, confidence: "medium" as const };
      }
      // Actuarial: probability of any structural repair event during term × cost benchmark.
      const probEvent = Math.min(1, years / 60);
      const cost = input.glaSqft * 18;
      const expected = cost * probEvent;
      const sigma = expected * 0.35;
      return {
        low: Math.max(0, Math.round(expected - sigma)),
        high: Math.round(expected + sigma),
        method: "actuarial" as const,
        confidence: "medium" as const
      };
    }
    case "Operating Cost Exclusions":
      return { ...deterministicRange(annualOp * years * 0.08), method: "deterministic" as const, confidence: "medium" as const };
    case "Demolition / Redevelopment Right": {
      const base = deterministicRange(annualRent * 0.5, 0.25, 1.75);
      const w = widenBenchmarked(base.low, base.high, annualRent);
      return { ...w, method: "benchmarked" as const, confidence: "low" as const };
    }
    case "Insurance Requirements":
      return { ...deterministicRange(input.glaSqft * years * 0.35), method: "deterministic" as const, confidence: "medium" as const };
    case "Management Fee Cap":
      return { ...deterministicRange(annualOp * 0.1 * years), method: "deterministic" as const, confidence: "medium" as const };
    default:
      return QUALITATIVE;
  }
}

export function buildQuantifiedItem(
  clauseType: string,
  _summary: string,
  input: AnalysisInput,
  facts?: LeaseQuantFacts | null
): Pick<ChangeItem, "impactLow" | "impactHigh" | "method" | "confidence" | "recommendation"> {
  void _summary;

  // PRD §10 non-negotiable: classification confidence < 0.70 (i.e. "low" tier) → qualitative.
  if (facts?.classificationConfidence === "low") {
    return {
      impactLow: null,
      impactHigh: null,
      method: "qualitative",
      confidence: "low",
      recommendation: "counter"
    };
  }

  // Out-of-scope clauses (PRD §5) are always qualitative.
  if (isOutOfScope(clauseType)) {
    return {
      impactLow: null,
      impactHigh: null,
      method: "qualitative",
      confidence: "low",
      recommendation: "counter"
    };
  }

  if (!(MVP_CLAUSE_TYPES as readonly string[]).includes(clauseType)) {
    return {
      impactLow: null,
      impactHigh: null,
      method: "qualitative",
      confidence: "low",
      recommendation: "counter"
    };
  }

  const estimate = estimateClauseImpact(clauseType as ClauseType, input, facts);
  const recommendation = estimate.high != null && estimate.high > 50000 ? "reject" : "counter";
  return {
    impactLow: estimate.low,
    impactHigh: estimate.high,
    method: estimate.method as QuantMethod,
    confidence: estimate.confidence as Confidence,
    recommendation
  };
}
