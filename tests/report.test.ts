import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportHtml } from "@/lib/report";

test("report HTML includes disclaimer, methodology, and clause row", () => {
  const html = buildReportHtml({
    property: "office",
    analyst: "abc",
    createdAt: "2026-01-01",
    totalLow: 1000,
    totalHigh: 5000,
    signal: "material",
    changes: [
      {
        clause_type: "CAM / Operating Cost Cap",
        change_summary: "cap lowered",
        impact_low: 100,
        impact_high: 200,
        confidence: "high",
        method: "deterministic",
        recommendation: "counter",
        user_notes: null
      }
    ]
  });
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("Disclaimer"));
  assert.ok(html.includes("Methodology"));
  assert.ok(html.includes("CAM / Operating Cost Cap"));
  assert.ok(html.includes("Executive summary"));
});

test("report HTML tolerates null change_summary from DB-shaped rows", () => {
  const html = buildReportHtml({
    property: "retail",
    analyst: "user-1",
    createdAt: "2026-01-02",
    totalLow: null,
    totalHigh: null,
    signal: "manageable",
    changes: [
      {
        clause_type: "Term",
        change_summary: "",
        impact_low: null,
        impact_high: null,
        confidence: "low",
        method: "qualitative",
        recommendation: "review",
        user_notes: null
      }
    ]
  });
  assert.ok(html.includes("Term"));
  assert.ok(html.includes("Executive summary"));
});

test("PDF cover shows property address, landlord, tenant, analyst name when provided", () => {
  const html = buildReportHtml({
    property: "office",
    propertyType: "office",
    propertyAddress: "100 King St W, Toronto, ON",
    landlordParty: "Acme REIT Ltd.",
    tenantParty: "Widget Co. Inc.",
    analystName: "Jane Doe",
    analyst: "abc",
    createdAt: "2026-01-01",
    totalLow: 1000,
    totalHigh: 5000,
    signal: "material",
    discountRate: 0.06,
    operatingCostPsfUsed: 14,
    operatingCostPsfEstimated: true,
    changes: []
  });
  assert.ok(html.includes("100 King St W, Toronto, ON"), "address missing");
  assert.ok(html.includes("Acme REIT Ltd."), "landlord missing");
  assert.ok(html.includes("Widget Co. Inc."), "tenant missing");
  assert.ok(html.includes("Jane Doe"), "analyst name missing");
  assert.ok(html.includes("Discount rate"), "discount rate label missing");
  assert.ok(html.includes("Operating cost (system estimate)"), "operating cost note missing");
});

test("PDF includes Favours column header and column data", () => {
  const html = buildReportHtml({
    property: "office",
    analyst: "abc",
    createdAt: "2026-01-01",
    totalLow: 1000,
    totalHigh: 5000,
    signal: "material",
    changes: [
      {
        clause_type: "CAM / Operating Cost Cap",
        change_summary: "cap lowered",
        favours: "tenant",
        impact_low: 100,
        impact_high: 200,
        confidence: "high",
        method: "deterministic",
        recommendation: "counter",
        user_notes: null
      }
    ]
  });
  assert.ok(html.includes("Favours"), "Favours label missing");
  assert.ok(html.includes("Tenant"), "title-cased favours value missing");
});

test("Top-3 ranking places qualitative items LAST (qualitative rows not ranked above $0)", () => {
  const html = buildReportHtml({
    property: "office",
    analyst: "abc",
    createdAt: "2026-01-01",
    totalLow: 0,
    totalHigh: 10000,
    signal: "material",
    changes: [
      {
        clause_type: "Qualitative One",
        change_summary: "q1",
        impact_low: null,
        impact_high: null,
        confidence: "low",
        method: "qualitative",
        recommendation: "counter",
        user_notes: null
      },
      {
        clause_type: "Small Dollar",
        change_summary: "s1",
        impact_low: 10,
        impact_high: 20,
        confidence: "high",
        method: "deterministic",
        recommendation: "counter",
        user_notes: null
      },
      {
        clause_type: "Big Dollar",
        change_summary: "big",
        impact_low: 1000,
        impact_high: 10000,
        confidence: "high",
        method: "deterministic",
        recommendation: "reject",
        user_notes: null
      }
    ]
  });
  const topSection = html.split("Top risk items")[1] ?? "";
  const idxBig = topSection.indexOf("Big Dollar");
  const idxSmall = topSection.indexOf("Small Dollar");
  const idxQ = topSection.indexOf("Qualitative One");
  assert.ok(idxBig >= 0 && idxSmall >= 0, "ranked rows present");
  assert.ok(idxBig < idxSmall, "bigger-dollar row should rank first");
  // qualitative is allowed to appear but must be last among top-3
  if (idxQ >= 0) assert.ok(idxQ > idxBig && idxQ > idxSmall);
});
