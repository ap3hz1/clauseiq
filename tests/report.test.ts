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
