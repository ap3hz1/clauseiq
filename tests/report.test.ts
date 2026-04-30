import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReportText, textToSimplePdf } from "@/lib/report";

test("report text includes disclaimer and rows", () => {
  const text = renderReportText({
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
  assert.ok(text.includes("Disclaimer"));
  assert.ok(text.includes("CAM / Operating Cost Cap"));
});

test("simple pdf output starts with pdf signature", () => {
  const bytes = textToSimplePdf("hello");
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  assert.ok(header.startsWith("%PDF-1.4"));
});
