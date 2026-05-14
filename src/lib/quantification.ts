import type { ChangeItem, AnalysisInput } from "@/lib/types";
import { inferClauseTypeFromText } from "@/lib/clauseKeywords";
import { extractFreeRentMonths, extractTiDeltaPsfPerSqFt } from "@/lib/leaseFacts";
import { buildQuantifiedItem, type ClauseType } from "@/lib/engine/quantification";

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

export function buildChangesFromParser(input: AnalysisInput, parsed: ParsedChange[]): ChangeItem[] {
  if (!parsed.length) return buildStubChanges(input);

  const limited = parsed.slice(0, MAX_PARSER_CHANGES);

  return limited.map((item) => {
    const inserted = item.inserted_text ?? "";
    const deleted = item.deleted_text ?? "";
    const clause = inferClauseTypeFromText(inserted, deleted);
    const combined = [inserted, deleted].filter(Boolean).join("\n\n");
    const changeSummary = combined.slice(0, 4000) || "Unclassified lease change detected.";
    const facts = {
      freeRentMonths: extractFreeRentMonths(inserted, deleted),
      tiDeltaPsf: extractTiDeltaPsfPerSqFt(inserted, deleted)
    };
    return {
      id: crypto.randomUUID(),
      clauseType: clause,
      changeSummary,
      favours: "tenant" as const,
      ...buildQuantifiedItem(clause, changeSummary, input, facts)
    };
  });
}
