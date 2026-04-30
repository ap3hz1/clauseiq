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

function npv(values: number[], discountRate: number): number {
  return values.reduce((acc, value, idx) => acc + value / (1 + discountRate) ** (idx + 1), 0);
}

function deterministicRange(base: number, lowMult = 0.9, highMult = 1.1) {
  return { low: Math.round(base * lowMult), high: Math.round(base * highMult) };
}

export function estimateClauseImpact(clause: ClauseType, input: AnalysisInput) {
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
      return { low: Math.round(npv(lowSeries, DISCOUNT_RATE)), high: Math.round(npv(highSeries, DISCOUNT_RATE)), method: "deterministic" as const, confidence: "high" as const };
    }
    case "Free Rent / Rent Abatement": {
      const monthly = annualRent / 12;
      const pv = Array.from({ length: 4 }, (_, i) => monthly / (1 + DISCOUNT_RATE / 12) ** (i + 1)).reduce((a, b) => a + b, 0);
      const range = deterministicRange(pv, 1, 1.05);
      return { ...range, method: "deterministic" as const, confidence: "high" as const };
    }
    case "Tenant Improvement Allowance":
      return { ...deterministicRange(input.glaSqft * 8), method: "deterministic" as const, confidence: "high" as const };
    case "HVAC Capital Replacement Responsibility":
      return { ...deterministicRange(input.glaSqft * 3.5, 0.7, 1.3), method: "actuarial" as const, confidence: "medium" as const };
    case "Roof Replacement Contribution":
      return { ...deterministicRange(input.glaSqft * years * 0.2), method: "actuarial" as const, confidence: "medium" as const };
    case "Personal Guarantee Scope":
      return { ...deterministicRange(annualRent * 0.35, 0.6, 1.4), method: "actuarial" as const, confidence: "medium" as const };
    case "Asphalt / Parking Lot Cap":
      return { ...deterministicRange(input.glaSqft * years * 0.45), method: "deterministic" as const, confidence: "high" as const };
    case "Assignment and Subletting Rights":
      return { ...deterministicRange(annualRent * 0.12, 0.6, 1.4), method: "benchmarked" as const, confidence: "medium" as const };
    case "Renewal Option Terms":
      return { ...deterministicRange(annualRent * 0.2), method: "deterministic" as const, confidence: "high" as const };
    case "Structural Repair Responsibility":
      return { ...deterministicRange(input.glaSqft * 6, 0.7, 1.3), method: "actuarial" as const, confidence: "medium" as const };
    case "Operating Cost Exclusions":
      return { ...deterministicRange(annualOp * years * 0.08), method: "deterministic" as const, confidence: "high" as const };
    case "Demolition / Redevelopment Right":
      return { ...deterministicRange(annualRent * 0.5, 0.25, 1.75), method: "benchmarked" as const, confidence: "low" as const };
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
  summary: string,
  input: AnalysisInput
): Pick<ChangeItem, "impactLow" | "impactHigh" | "method" | "confidence" | "recommendation"> {
  if (clauseType === "Unclassified Change") {
    return {
      impactLow: null,
      impactHigh: null,
      method: "qualitative",
      confidence: "low",
      recommendation: "counter"
    };
  }
  const estimate = estimateClauseImpact(clauseType, input);
  const recommendation = estimate.high && estimate.high > 50000 ? "reject" : "counter";
  return {
    impactLow: estimate.low,
    impactHigh: estimate.high,
    method: estimate.method as QuantMethod,
    confidence: estimate.confidence as Confidence,
    recommendation
  };
}
