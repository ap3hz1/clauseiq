import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStubChanges } from "@/lib/quantification";
import { buildQuantifiedItem, estimateClauseImpact, DEFAULT_DISCOUNT_RATE } from "@/lib/engine/quantification";
import { extractPersonalGuaranteeMonths } from "@/lib/leaseFacts";
import { getDefaultRate, EXPECTED_RECOVERY_RATE } from "@/lib/actuarial";
import type { AnalysisInput } from "@/lib/types";

const sampleInput: AnalysisInput = {
  propertyType: "office",
  province: "ON",
  glaSqft: 10000,
  baseRentPsf: 30,
  leaseTermYears: 5,
  operatingCostPsf: 12
};

test("stub changes include quantified ranges", () => {
  const rows = buildStubChanges(sampleInput);
  assert.ok(rows.length >= 5);
  const hasNonNull = rows.some((r) => r.impactLow !== null && r.impactHigh !== null);
  assert.ok(hasNonNull, "at least one stub row should be quantified");
});

test("CAM cap estimate produces non-negative range", () => {
  const estimate = estimateClauseImpact("CAM / Operating Cost Cap", sampleInput);
  assert.ok((estimate.low ?? 0) >= 0);
  assert.ok((estimate.high ?? 0) >= (estimate.low ?? 0));
});

test("CAM cap NPV reacts to configurable discount rate (higher r → lower PV)", () => {
  const lowR = estimateClauseImpact("CAM / Operating Cost Cap", { ...sampleInput, discountRate: 0.04 });
  const highR = estimateClauseImpact("CAM / Operating Cost Cap", { ...sampleInput, discountRate: 0.1 });
  assert.ok((lowR.high ?? 0) > (highR.high ?? 0), "higher discount rate must produce smaller PV");
});

test("CAM cap NPV uses 0.06 default when discount rate omitted", () => {
  const a = estimateClauseImpact("CAM / Operating Cost Cap", { ...sampleInput, discountRate: undefined });
  const b = estimateClauseImpact("CAM / Operating Cost Cap", { ...sampleInput, discountRate: DEFAULT_DISCOUNT_RATE });
  assert.equal(a.high, b.high);
});

test("Free Rent PV with delta months matches closed-form geometric sum", () => {
  const monthly = (sampleInput.baseRentPsf * sampleInput.glaSqft) / 12;
  const d = DEFAULT_DISCOUNT_RATE;
  const deltaMonths = 3;
  let expected = 0;
  for (let m = 1; m <= deltaMonths; m++) expected += monthly / (1 + d / 12) ** m;
  const est = estimateClauseImpact("Free Rent / Rent Abatement", sampleInput, {
    freeRentDeltaMonths: deltaMonths
  });
  const low = est.low ?? 0;
  const high = est.high ?? 0;
  assert.ok(low <= Math.round(expected * 0.97) + 1 && low >= Math.round(expected * 0.97) - 1);
  assert.ok(high <= Math.round(expected * 1.04) + 1 && high >= Math.round(expected * 1.04) - 1);
});

test("Free Rent clawback removal → qualitative", () => {
  const est = estimateClauseImpact("Free Rent / Rent Abatement", sampleInput, { freeRentClawbackRemoved: true });
  assert.equal(est.method, "qualitative");
  assert.equal(est.low, null);
  assert.equal(est.high, null);
});

test("Personal Guarantee formula: Loss = R × (T_orig − T_cap) × P_default × (1 − E_rec)", () => {
  const annualRent = sampleInput.baseRentPsf * sampleInput.glaSqft;
  const monthly = annualRent / 12;
  const tOrig = 60;
  const tCap = 6;
  const exposed = monthly * (tOrig - tCap);
  const rate = getDefaultRate(sampleInput.propertyType);
  const pLow = Math.max(0, rate.pDefault - rate.sigma);
  const pHigh = rate.pDefault + rate.sigma;
  const recoveryFactor = 1 - EXPECTED_RECOVERY_RATE;
  const expectedLow = Math.round(exposed * pLow * recoveryFactor);
  const expectedHigh = Math.round(exposed * pHigh * recoveryFactor);
  const est = estimateClauseImpact("Personal Guarantee Scope", sampleInput, {
    pgTOrigMonths: tOrig,
    pgTCapMonths: tCap
  });
  assert.equal(est.low, expectedLow);
  assert.equal(est.high, expectedHigh);
  assert.equal(est.method, "actuarial");
});

test("Personal Guarantee falls back to qualitative when months not parseable", () => {
  const est = estimateClauseImpact("Personal Guarantee Scope", sampleInput);
  assert.equal(est.method, "qualitative");
  assert.equal(est.low, null);
});

test("Personal Guarantee qualitative when T_orig <= T_cap (no exposure)", () => {
  const est = estimateClauseImpact("Personal Guarantee Scope", sampleInput, {
    pgTOrigMonths: 6,
    pgTCapMonths: 6
  });
  assert.equal(est.method, "qualitative");
});

test("extractPersonalGuaranteeMonths parses 'capped to 6 months' from redline", () => {
  const inserted = "The personal guarantee shall be limited to 6 months of Base Rent.";
  const deleted = "The personal guarantee shall apply for the full term of this Lease.";
  const pg = extractPersonalGuaranteeMonths(inserted, deleted, 60);
  assert.equal(pg.tCapMonths, 6);
  assert.equal(pg.tOrigMonths, 60);
});

test("Trust gate: classification confidence 'low' forces qualitative regardless of clauseType", () => {
  const item = buildQuantifiedItem("CAM / Operating Cost Cap", "x", sampleInput, {
    classificationConfidence: "low"
  });
  assert.equal(item.method, "qualitative");
  assert.equal(item.impactLow, null);
  assert.equal(item.impactHigh, null);
});

test("Trust gate: classification confidence 'medium' lets CAM quantify", () => {
  const item = buildQuantifiedItem("CAM / Operating Cost Cap", "x", sampleInput, {
    classificationConfidence: "medium"
  });
  assert.equal(item.method, "deterministic");
  assert.ok((item.impactHigh ?? 0) >= 0);
});

test("Out-of-scope topics route to qualitative even with high confidence", () => {
  const item = buildQuantifiedItem("Force Majeure", "force majeure broadened", sampleInput, {
    classificationConfidence: "high"
  });
  assert.equal(item.method, "qualitative");
  assert.equal(item.impactLow, null);
});

test("Missing operating cost yields qualitative for CAM (no silent default)", () => {
  const inputNoOp = { ...sampleInput, operatingCostPsf: undefined };
  const est = estimateClauseImpact("CAM / Operating Cost Cap", inputNoOp);
  assert.equal(est.method, "qualitative");
  assert.equal(est.low, null);
});
