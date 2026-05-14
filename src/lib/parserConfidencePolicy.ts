import type { ChangeItem, Confidence } from "@/lib/types";

/**
 * PRD §7.1: when extraction is not DOCX tracked-changes ground truth, flag lower
 * confidence on quantified rows (PDF diff, clean DOCX diff, or stub templates).
 */
export function applyParserConfidenceCascade(
  changes: ChangeItem[],
  parserPath: string | undefined,
  parserConfidence: Confidence | undefined
): ChangeItem[] {
  const path = parserPath ?? "";
  const trustedTracked = path === "docx-tracked" && parserConfidence === "high";
  if (trustedTracked) return changes;

  return changes.map((c) => {
    if (c.impactLow == null && c.impactHigh == null) return c;
    let next: Confidence = c.confidence;
    if (next === "high") next = "medium";
    else if (next === "medium") next = "low";
    else next = "low";
    return next === c.confidence ? c : { ...c, confidence: next };
  });
}
