import type { AnalysisInput, ChangeItem, Confidence, QuantMethod } from "@/lib/types";

const DISCOUNT_RATE = 0.06;

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

export function normalizeClauseType(raw: string): ClauseType | "Unclassified Change" {
  const t = raw.trim();
  if ((MVP_CLAUSE_TYPES as readonly string[]).includes(t)) return t as ClauseType;
  return "Unclassified Change";
}

export type StructuralFacet = "cost_shift" | "gross_negligence" | "rent_abatement_trigger" | "termination_trigger";
export type RenewalFacet = "extra_term" | "notice_window" | "renewal_free_rent" | "rent_floor_removed";

export interface LeaseQuantFacts {
  /** Full redline-side months (legacy / display). */
  freeRentMonths?: number | null;
  /** Incremental months: redline − base (primary driver for PV). */
  freeRentDeltaMonths?: number | null;
  freeRentClawbackRemoved?: boolean;
  tiDeltaPsf?: number | null;
  structuralFacet?: StructuralFacet;
  renewalFacet?: RenewalFacet;
  tenantProportionateShare?: number | null;
  assignmentProfitShareRemoved?: boolean;
}

function npv(values: number[], discountRate: number): number {
  return values.reduce((acc, value, idx) => acc + value / (1 + discountRate) ** (idx + 1), 0);
}

function deterministicRange(base: number, lowMult = 0.9, highMult = 1.1) {
  return { low: Math.round(base * lowMult), high: Math.round(base * highMult) };
}

/** Benchmarked bands: enforce materially wider low–high than typical deterministic tight ranges. */
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

export function estimateClauseImpact(clause: ClauseType, input: AnalysisInput, facts?: LeaseQuantFacts | null) {
  const annualRent = input.baseRentPsf * input.glaSqft;
  const annualOp = (input.operatingCostPsf ?? 14) * input.glaSqft;
  const years = Math.max(1, Math.round(input.leaseTermYears));

  switch (clause) {
    case "CAM / Operating Cost Cap": {
      const lowSeries = Array.from({ length: years }, (_, i) =>
        Math.max(0, annualOp * ((1 + 0.04) ** (i + 1) - (1 + 0.03) ** (i + 1)))
      );
      const highSeries = Array.from({ length: years }, (_, i) =>
        Math.max(0, annualOp * ((1 + 0.06) ** (i + 1) - (1 + 0.03) ** (i + 1)))
      );
      return {
        low: Math.round(npv(lowSeries, DISCOUNT_RATE)),
        high: Math.round(npv(highSeries, DISCOUNT_RATE)),
        method: "deterministic" as const,
        confidence: "high" as const
      };
    }
    case "Free Rent / Rent Abatement": {
      const monthly = annualRent / 12;
      if (facts?.freeRentClawbackRemoved) {
        return { low: null, high: null, method: "qualitative" as const, confidence: "low" as const };
      }
      const dm = facts?.freeRentDeltaMonths;
      if (dm !== undefined && dm !== null) {
        if (dm <= 0) {
          return { low: null, high: null, method: "qualitative" as const, confidence: "low" as const };
        }
        const pv = pvFreeRentDeltaMonths(monthly, dm, DISCOUNT_RATE);
        const range = deterministicRange(pv, 0.97, 1.04);
        return { ...range, method: "deterministic" as const, confidence: "high" as const };
      }
      const monthsFromLease = facts?.freeRentMonths;
      const m = Math.min(Math.max(1, monthsFromLease ?? 4), 36);
      const pv = Array.from({ length: m }, (_, i) => monthly / (1 + DISCOUNT_RATE / 12) ** (i + 1)).reduce((a, b) => a + b, 0);
      const range = deterministicRange(pv, 1, 1.05);
      const fromLease = monthsFromLease != null && !Number.isNaN(monthsFromLease);
      const confidence = fromLease ? ("high" as const) : ("medium" as const);
      return {
        ...range,
        method: "deterministic" as const,
        confidence
      };
    }
    case "Tenant Improvement Allowance": {
      if (facts?.tiDeltaPsf != null && facts.tiDeltaPsf > 0) {
        const delta = facts.tiDeltaPsf * input.glaSqft;
        return { ...deterministicRange(delta, 0.95, 1.05), method: "deterministic" as const, confidence: "high" as const };
      }
      return { ...deterministicRange(input.glaSqft * 8), method: "deterministic" as const, confidence: "high" as const };
    }
    case "HVAC Capital Replacement Responsibility":
      return { ...deterministicRange(input.glaSqft * 3.5, 0.7, 1.3), method: "actuarial" as const, confidence: "medium" as const };
    case "Roof Replacement Contribution":
      return { ...deterministicRange(input.glaSqft * years * 0.2), method: "actuarial" as const, confidence: "medium" as const };
    case "Personal Guarantee Scope":
      return { ...deterministicRange(annualRent * 0.35, 0.6, 1.4), method: "actuarial" as const, confidence: "medium" as const };
    case "Asphalt / Parking Lot Cap":
      return { ...deterministicRange(input.glaSqft * years * 0.45), method: "deterministic" as const, confidence: "high" as const };
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
      if (rf === "notice_window") {
        return { low: null, high: null, method: "qualitative" as const, confidence: "low" as const };
      }
      if (rf === "renewal_free_rent") {
        const monthly = annualRent / 12;
        const y = Math.max(1, input.leaseTermYears);
        const pv = (monthly * 2) / (1 + DISCOUNT_RATE) ** y;
        return { ...deterministicRange(pv, 0.94, 1.06), method: "deterministic" as const, confidence: "medium" as const };
      }
      if (rf === "rent_floor_removed") {
        const low = annualRent * years * 0.1;
        const high = annualRent * years * 0.22;
        const w = widenBenchmarked(low, high, annualRent);
        return { ...w, method: "benchmarked" as const, confidence: "medium" as const };
      }
      return { ...deterministicRange(annualRent * 0.2), method: "deterministic" as const, confidence: "high" as const };
    }
    case "Structural Repair Responsibility": {
      const sf = facts?.structuralFacet;
      if (sf === "gross_negligence" || sf === "rent_abatement_trigger" || sf === "termination_trigger") {
        return { low: null, high: null, method: "qualitative" as const, confidence: "low" as const };
      }
      if (sf === "cost_shift") {
        const tps = facts?.tenantProportionateShare ?? 0.13;
        const annualStructuralPerSf = 2.8;
        const exposure = tps * annualStructuralPerSf * input.glaSqft * years;
        return { ...deterministicRange(exposure, 0.82, 1.12), method: "deterministic" as const, confidence: "medium" as const };
      }
      return { ...deterministicRange(input.glaSqft * 6, 0.7, 1.3), method: "actuarial" as const, confidence: "medium" as const };
    }
    case "Operating Cost Exclusions":
      return { ...deterministicRange(annualOp * years * 0.08), method: "deterministic" as const, confidence: "high" as const };
    case "Demolition / Redevelopment Right": {
      const base = deterministicRange(annualRent * 0.5, 0.25, 1.75);
      const w = widenBenchmarked(base.low, base.high, annualRent);
      return { ...w, method: "benchmarked" as const, confidence: "low" as const };
    }
    case "Insurance Requirements":
      return { ...deterministicRange(input.glaSqft * years * 0.35), method: "deterministic" as const, confidence: "high" as const };
    case "Management Fee Cap":
      return { ...deterministicRange(annualOp * 0.1 * years), method: "deterministic" as const, confidence: "high" as const };
    default:
      return { low: null, high: null, method: "qualitative" as const, confidence: "low" as const };
  }
}

export function buildQuantifiedItem(
  clauseType: ClauseType | "Unclassified Change",
  _summary: string,
  input: AnalysisInput,
  facts?: LeaseQuantFacts | null
): Pick<ChangeItem, "impactLow" | "impactHigh" | "method" | "confidence" | "recommendation"> {
  void _summary;
  if (clauseType === "Unclassified Change") {
    return {
      impactLow: null,
      impactHigh: null,
      method: "qualitative",
      confidence: "low",
      recommendation: "counter"
    };
  }
  const estimate = estimateClauseImpact(clauseType, input, facts);
  const recommendation = estimate.high != null && estimate.high > 50000 ? "reject" : "counter";
  return {
    impactLow: estimate.low,
    impactHigh: estimate.high,
    method: estimate.method as QuantMethod,
    confidence: estimate.confidence as Confidence,
    recommendation
  };
}
