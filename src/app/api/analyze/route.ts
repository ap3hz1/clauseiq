import { NextRequest, NextResponse } from "next/server";
import { buildStubChanges } from "@/lib/quantification";
import type { AnalysisInput, AnalysisResult, RiskSignal } from "@/lib/types";

function classifySignal(high: number): RiskSignal {
  if (high < 75000) return "manageable";
  if (high < 250000) return "material";
  return "significant";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AnalysisInput;

  const changes = buildStubChanges(body);
  const totals = changes.reduce(
    (acc, c) => {
      acc.low += c.impactLow ?? 0;
      acc.high += c.impactHigh ?? 0;
      return acc;
    },
    { low: 0, high: 0 }
  );

  const result: AnalysisResult = {
    id: crypto.randomUUID(),
    status: "complete",
    storageMode: "local-fallback",
    totalChanges: changes.length,
    totalImpactLow: totals.low,
    totalImpactHigh: totals.high,
    signal: classifySignal(totals.high),
    changes
  };

  return NextResponse.json(result);
}
