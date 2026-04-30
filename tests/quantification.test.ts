import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStubChanges } from "@/lib/quantification";
import { estimateClauseImpact } from "@/lib/engine/quantification";

const sampleInput = {
  propertyType: "office" as const,
  province: "ON" as const,
  glaSqft: 10000,
  baseRentPsf: 30,
  leaseTermYears: 5,
  operatingCostPsf: 12
};

test("stub changes include quantified ranges", () => {
  const rows = buildStubChanges(sampleInput);
  assert.ok(rows.length >= 5);
  const quantified = rows.filter((r) => r.impactLow !== null && r.impactHigh !== null);
  assert.ok(quantified.length >= 4);
});

test("cam cap estimate produces non-negative range", () => {
  const estimate = estimateClauseImpact("CAM / Operating Cost Cap", sampleInput);
  assert.ok((estimate.low ?? 0) >= 0);
  assert.ok((estimate.high ?? 0) >= (estimate.low ?? 0));
});
