import type { RiskSignal } from "@/lib/types";

export function classifyRiskSignal(high: number): RiskSignal {
  if (high < 75000) return "manageable";
  if (high < 250000) return "material";
  return "significant";
}
