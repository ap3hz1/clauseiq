import type { ChangeItem, AnalysisInput } from "@/lib/types";
import { buildQuantifiedItem, type ClauseType } from "@/lib/engine/quantification";

export function buildStubChanges(input: AnalysisInput): ChangeItem[] {
  const samples: Array<{ clauseType: ClauseType; changeSummary: string }> = [
    { clauseType: "CAM / Operating Cost Cap", changeSummary: "Tenant proposes 3% non-cumulative CAM cap instead of uncapped pass-through." },
    { clauseType: "Free Rent / Rent Abatement", changeSummary: "Tenant requested four months free base rent at lease commencement." },
    { clauseType: "Personal Guarantee Scope", changeSummary: "Guarantee is capped to 6 months instead of full term obligations." },
    { clauseType: "Demolition / Redevelopment Right", changeSummary: "Landlord demolition termination right removed from redevelopment clause." },
    { clauseType: "Operating Cost Exclusions", changeSummary: "Expanded operating cost exclusions beyond market standard scope." }
  ];
  return [
    ...samples.map((sample) => ({
      id: crypto.randomUUID(),
      clauseType: sample.clauseType,
      changeSummary: sample.changeSummary,
      favours: "tenant" as const,
      ...buildQuantifiedItem(sample.clauseType, sample.changeSummary, input)
    })),
    {
      id: crypto.randomUUID(),
      clauseType: "Unclassified Change",
      changeSummary: "Force majeure language broadened to include rent abatement triggers.",
      favours: "tenant",
      ...buildQuantifiedItem("Unclassified Change", "Force majeure", input)
    }
  ];
}

interface ParsedChange {
  change_type: string;
  inserted_text: string;
  deleted_text: string;
}

function qualitativeChange(summary: string): ChangeItem {
  return {
    id: crypto.randomUUID(),
    clauseType: "Unclassified Change",
    changeSummary: summary,
    favours: "neutral",
    impactLow: null,
    impactHigh: null,
    confidence: "low",
    method: "qualitative",
    recommendation: "counter"
  };
}

export function buildChangesFromParser(input: AnalysisInput, parsed: ParsedChange[]): ChangeItem[] {
  if (!parsed.length) return buildStubChanges(input);

  const mapped = parsed.slice(0, 25).map((item) => {
    const text = `${item.inserted_text} ${item.deleted_text}`.toLowerCase();
    const summary = item.inserted_text || item.deleted_text || "Unclassified lease change detected.";
    let clause: ClauseType | "Unclassified Change" = "Unclassified Change";
    if (text.includes("cam") || text.includes("operating cost") || text.includes("management fee")) clause = "CAM / Operating Cost Cap";
    if (text.includes("free rent") || text.includes("abatement")) clause = "Free Rent / Rent Abatement";
    if (text.includes("guarantee") || text.includes("default")) clause = "Personal Guarantee Scope";
    if (text.includes("assignment") || text.includes("sublet")) clause = "Assignment and Subletting Rights";
    if (text.includes("renewal")) clause = "Renewal Option Terms";
    if (text.includes("insurance")) clause = "Insurance Requirements";
    if (text.includes("roof")) clause = "Roof Replacement Contribution";
    if (text.includes("hvac")) clause = "HVAC Capital Replacement Responsibility";
    if (text.includes("structural")) clause = "Structural Repair Responsibility";
    if (text.includes("demolition") || text.includes("redevelopment")) clause = "Demolition / Redevelopment Right";

    const detail = item.inserted_text || item.deleted_text || "Unclassified lease change detected.";
    return {
      id: crypto.randomUUID(),
      clauseType: clause,
      changeSummary: detail,
      favours: "tenant" as const,
      ...buildQuantifiedItem(clause, summary, input)
    };
  });

  return mapped;
}
