import { test } from "node:test";
import assert from "node:assert/strict";
import { filterNoiseParsedChanges, isNoiseParsedChange } from "@/lib/changeFilters";
import { extractFreeRentMonths } from "@/lib/leaseFacts";
import { inferClauseTypeFromText } from "@/lib/clauseKeywords";
import { buildChangesFromParser } from "@/lib/quantification";
import type { AnalysisInput } from "@/lib/types";

const sampleInput: AnalysisInput = {
  propertyType: "office",
  province: "ON",
  glaSqft: 18000,
  baseRentPsf: 34,
  leaseTermYears: 5,
  operatingCostPsf: 14
};

test("filterNoiseParsedChanges removes appendix / negotiation-draft rows", () => {
  const rows = [
    { change_type: "modification", inserted_text: "CAM cap at three percent non-cumulative.", deleted_text: "" },
    {
      change_type: "modification",
      inserted_text: "APPENDIX — LEASE SUMMARY DATA (TENANT-FAVORABLE NEGOTIATION DRAFT) The following summary",
      deleted_text: ""
    }
  ];
  const kept = filterNoiseParsedChanges(rows);
  assert.equal(kept.length, 1);
  assert.ok(isNoiseParsedChange(rows[1]));
});

test("extractFreeRentMonths finds four (4) from redline-style wording", () => {
  const inserted =
    "expiring on January 31, 2026, being a period of four (4) full calendar months. During the Free Rent Period";
  assert.equal(extractFreeRentMonths(inserted, ""), 4);
});

test("inferClauseTypeFromText classifies structural repair before generic operating cost", () => {
  const t =
    "The Landlord shall, at its sole cost and expense (not recoverable through Operating Costs except as expressly stated herein), maintain and keep in good repair the structural elements of the Building";
  assert.equal(inferClauseTypeFromText(t, ""), "Structural Repair Responsibility");
});

test("buildChangesFromParser tags free rent row and applies quant", () => {
  const parsed = [
    {
      change_type: "modification" as const,
      inserted_text:
        "Notwithstanding the provisions of Section 3.1, the Landlord hereby grants the Tenant a free rent period with respect to Base Rent only, commencing on the Commencement Date and expiring on January 31, 2026, being a period of four (4) full calendar months.",
      deleted_text: "two (2) full calendar months."
    }
  ];
  const changes = buildChangesFromParser(sampleInput, parsed);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].clauseType, "Free Rent / Rent Abatement");
  assert.ok(changes[0].impactLow != null && changes[0].impactHigh != null);
});
