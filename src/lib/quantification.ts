import type { ChangeItem, AnalysisInput } from "@/lib/types";
import type { ClassifiedChange } from "@/lib/rag";
import { buildQuantifiedItem, type ClauseType } from "@/lib/engine/quantification";
import { appendSyntheticProfitShareRow, expandParserChangeToItems, mergeDuplicateChangeRows, type ParsedChange } from "@/lib/changePipeline";

const MAX_PARSER_CHANGES = 100;

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
      originalText: sample.changeSummary,
      redlinedText: sample.changeSummary,
      favours: "tenant" as const,
      ...buildQuantifiedItem(sample.clauseType, sample.changeSummary, input)
    })),
    {
      id: crypto.randomUUID(),
      clauseType: "Unclassified Change",
      changeSummary: "Force majeure language broadened to include rent abatement triggers.",
      originalText: "Force majeure language broadened to include rent abatement triggers.",
      redlinedText: "Force majeure language broadened to include rent abatement triggers.",
      favours: "tenant",
      ...buildQuantifiedItem("Unclassified Change", "Force majeure", input)
    }
  ];
}

export function buildChangesFromParser(input: AnalysisInput, parsed: ParsedChange[], classified?: ClassifiedChange[]): ChangeItem[] {
  if (!parsed.length) return buildStubChanges(input);

  const limited = parsed.slice(0, MAX_PARSER_CHANGES) as ParsedChange[];

  let rows: ChangeItem[] = [];
  for (let i = 0; i < limited.length; i++) {
    rows.push(...expandParserChangeToItems(limited[i], input, classified?.[i] ?? null));
  }
  rows = mergeDuplicateChangeRows(rows);
  rows = [...rows, ...appendSyntheticProfitShareRow(limited, input, rows)];
  rows = mergeDuplicateChangeRows(rows);

  return rows.filter((r) => r.originalText.trim().length > 0 && r.redlinedText.trim().length > 0);
}
