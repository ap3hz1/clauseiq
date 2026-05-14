import type { AnalysisInput, ChangeItem, Favours } from "@/lib/types";
import type { ClassifiedChange } from "@/lib/rag";
import { inferClauseTypeFromText } from "@/lib/clauseKeywords";
import {
  detectProfitShareDeletionAcrossDocument,
  detectsFreeRentClawbackRemoval,
  extractFreeRentDeltaMonths,
  extractTenantProportionateShare,
  extractTiDeltaPsfPerSqFt
} from "@/lib/leaseFacts";
import { buildQuantifiedItem, normalizeClauseType, type ClauseType, type LeaseQuantFacts } from "@/lib/engine/quantification";

export interface ParsedChange {
  change_type: string;
  inserted_text: string;
  deleted_text: string;
}

function resolveClauseType(inferred: ClauseType | "Unclassified Change", classified: ClassifiedChange | null): ClauseType | "Unclassified Change" {
  if (inferred !== "Unclassified Change") return inferred;
  if (classified?.clauseType) return normalizeClauseType(classified.clauseType);
  return "Unclassified Change";
}

function mergeSummaries(a: string, b: string, maxLen: number): string {
  const parts = [a.trim(), b.trim()].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(" ").slice(0, maxLen);
}

function materiallyDifferent(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
  const y = b.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
  if (x === y) return false;
  if (x.length >= 40 && y.length >= 40 && (x.includes(y) || y.includes(x))) return false;
  return true;
}

/** Merge rows that share clause_type and materially the same summary (multi-paragraph duplicates). */
export function mergeDuplicateChangeRows(rows: ChangeItem[]): ChangeItem[] {
  const out: ChangeItem[] = [];
  for (const r of rows) {
    const dupIdx = out.findIndex((o) => o.clauseType === r.clauseType && !materiallyDifferent(o.changeSummary, r.changeSummary));
    if (dupIdx === -1) {
      out.push({ ...r });
      continue;
    }
    const o = out[dupIdx];
    const pickQuant = (r.impactHigh ?? 0) >= (o.impactHigh ?? 0) ? r : o;
    out[dupIdx] = {
      ...o,
      changeSummary: mergeSummaries(o.changeSummary, r.changeSummary, 4000),
      originalText: mergeSummaries(o.originalText ?? "", r.originalText ?? "", 12000),
      redlinedText: mergeSummaries(o.redlinedText ?? "", r.redlinedText ?? "", 12000),
      impactLow: pickQuant.impactLow,
      impactHigh: pickQuant.impactHigh,
      method: pickQuant.method,
      confidence: pickQuant.confidence,
      recommendation: pickQuant.recommendation
    };
  }
  return out;
}

function shouldExpandStructural(inserted: string, deleted: string): boolean {
  const t = `${inserted} ${deleted}`.toLowerCase();
  let n = 0;
  if (/not recoverable through operating costs|sole cost and expense.*structural|structural elements/i.test(t)) n++;
  if (/gross\s+negligence/i.test(t) && /negligence/i.test(t)) n++;
  if (/5\s+consecutive\s+business\s+days/i.test(t) && /30\s+consecutive/i.test(t)) n++;
  if (/90\s+consecutive|ninety\s*\(?90/i.test(t) && /180\s+consecutive|one\s+hundred\s+and\s+eighty/i.test(t)) n++;
  return n >= 2;
}

function shouldExpandRenewal(inserted: string, deleted: string): boolean {
  const t = `${inserted} ${deleted}`.toLowerCase();
  let n = 0;
  if (/(?:two|2)\s*\(?2\)?\s+renewal|two\s+renewal\s+terms|second\s+renewal/i.test(t)) n++;
  if (/6\s*[–-]\s*12\s+months|six\s*\(?6\)?.*twelve\s*\(?12\).*months.*notice/i.test(t) && /9\s*[–-]\s*12|nine.*twelve/i.test(t)) n++;
  if (/(?:two|2)\s*\(?2\)?\s*(?:full\s+)?calendar\s+months.*renewal|free\s+rent.*each\s+renewal/i.test(t)) n++;
  if (
    /(?:not\s+)?less\s+than.*final.*year|final\s+year.*base\s+rent|renewal\s+rent.*(?:not\s+)?less/i.test(deleted.toLowerCase()) &&
    !/not\s+less\s+than.*final/i.test(inserted.toLowerCase())
  )
    n++;
  return n >= 2;
}

function baseChangeFields(
  clauseType: ClauseType | "Unclassified Change",
  changeSummary: string,
  favours: Favours,
  input: AnalysisInput,
  facts: LeaseQuantFacts | null,
  originalText: string,
  redlinedText: string
): ChangeItem {
  return {
    id: crypto.randomUUID(),
    clauseType,
    changeSummary,
    favours,
    originalText,
    redlinedText,
    ...buildQuantifiedItem(clauseType, changeSummary, input, facts)
  };
}

export function appendSyntheticProfitShareRow(parsed: ParsedChange[], input: AnalysisInput, existing: ChangeItem[]): ChangeItem[] {
  const fullDel = parsed.map((p) => p.deleted_text ?? "").join("\n\n");
  const fullIns = parsed.map((p) => p.inserted_text ?? "").join("\n\n");
  if (!detectProfitShareDeletionAcrossDocument(fullDel, fullIns)) return [];

  const already = existing.some(
    (c) =>
      c.clauseType === "Assignment and Subletting Rights" &&
      /profit|50\s*%|fifty percent|sublet.*excess/i.test(`${c.changeSummary} ${c.originalText ?? ""}`)
  );
  if (already) return [];

  const originalText = excerptAround(fullDel, /fifty percent|50\s*%|subletting profit|excess rent/i, 900);
  const redlinedText = excerptAround(fullIns, /retain any and all|without any obligation to account|100%/i, 900);
  if (!originalText.trim() || !redlinedText.trim()) return [];

  const summary =
    "Landlord's 50% share of subletting / assignment excess profit removed; tenant may retain 100% of profit on future transfers (benchmarked exposure to forgone landlord participation).";

  return [
    baseChangeFields(
      "Assignment and Subletting Rights",
      summary,
      "tenant",
      input,
      { assignmentProfitShareRemoved: true },
      originalText,
      redlinedText
    )
  ];
}

function excerptAround(text: string, re: RegExp, radius: number): string {
  const t = text.trim();
  if (!t) return "";
  const m = re.exec(t);
  if (!m || m.index == null) return t.slice(0, Math.min(radius * 2, t.length));
  const start = Math.max(0, m.index - radius);
  const end = Math.min(t.length, m.index + m[0].length + radius);
  return t.slice(start, end).trim();
}

export function expandParserChangeToItems(
  item: ParsedChange,
  input: AnalysisInput,
  classified: ClassifiedChange | null
): ChangeItem[] {
  const inserted = (item.inserted_text ?? "").trim();
  const deleted = (item.deleted_text ?? "").trim();
  if (!inserted || !deleted) return [];

  const inferred = inferClauseTypeFromText(inserted, deleted);
  const combined = [inserted, deleted].join("\n\n");

  if (inferred === "Structural Repair Responsibility" && shouldExpandStructural(inserted, deleted)) {
    return expandStructuralRows(inserted, deleted, combined, input, classified);
  }
  if (inferred === "Renewal Option Terms" && shouldExpandRenewal(inserted, deleted)) {
    return expandRenewalRows(inserted, deleted, combined, input, classified);
  }

  const clause = resolveClauseType(inferred, classified);
  const changeSummary =
    classified?.summary?.trim() && classified.summary.trim().length > 24
      ? classified.summary.trim().slice(0, 4000)
      : combined.slice(0, 4000) || "Unclassified lease change detected.";
  const favours: Favours = classified?.favours ?? "tenant";

  if (clause === "Free Rent / Rent Abatement") {
    const delta = extractFreeRentDeltaMonths(inserted, deleted);
    const facts: LeaseQuantFacts = {
      freeRentDeltaMonths: delta.deltaMonths,
      freeRentMonths: delta.redlineMonths
    };
    const rows: ChangeItem[] = [
      baseChangeFields(clause, changeSummary, favours, input, facts, deleted.slice(0, 12000), inserted.slice(0, 12000))
    ];
    if (detectsFreeRentClawbackRemoval(deleted, inserted)) {
      rows.push(
        baseChangeFields(
          clause,
          "Free rent / abated Base Rent made unconditional: landlord clawback of abated rent on default removed vs. base lease (qualitative credit / enforcement risk).",
          favours,
          input,
          { freeRentClawbackRemoved: true },
          deleted.slice(0, 12000),
          inserted.slice(0, 12000)
        )
      );
    }
    return rows;
  }

  const tiDelta = extractTiDeltaPsfPerSqFt(inserted, deleted);
  const facts: LeaseQuantFacts = { tiDeltaPsf: tiDelta ?? undefined };
  return [baseChangeFields(clause, changeSummary, favours, input, facts, deleted.slice(0, 12000), inserted.slice(0, 12000))];
}

function expandStructuralRows(
  inserted: string,
  deleted: string,
  combined: string,
  input: AnalysisInput,
  classified: ClassifiedChange | null
): ChangeItem[] {
  const ot = deleted.slice(0, 12000);
  const rt = inserted.slice(0, 12000);
  const tps = extractTenantProportionateShare(inserted, deleted) ?? undefined;
  const favours: Favours = classified?.favours ?? "tenant";

  const rows: ChangeItem[] = [];

  if (/not recoverable through operating costs|sole cost and expense/i.test(`${inserted} ${deleted}`.toLowerCase())) {
    rows.push(
      baseChangeFields(
        "Structural Repair Responsibility",
        "Structural / base-building maintenance shifted to landlord (not recoverable through Operating Costs except as stated); exposure modeled as tenant TPS × estimated annual structural maintenance × lease term (BOMA-style benchmark).",
        favours,
        input,
        { structuralFacet: "cost_shift", tenantProportionateShare: tps },
        ot,
        rt
      )
    );
  }
  if (/gross\s+negligence/i.test(inserted) && /\bnegligence\b/i.test(deleted) && !/gross\s+negligence/i.test(deleted)) {
    rows.push(
      baseChangeFields(
        "Structural Repair Responsibility",
        "Landlord liability threshold raised from negligence to gross negligence for certain repair / casualty contexts (qualitative allocation of fault risk).",
        favours,
        input,
        { structuralFacet: "gross_negligence" },
        ot,
        rt
      )
    );
  }
  if (/5\s+consecutive\s+business\s+days/i.test(inserted) && /30\s+consecutive/i.test(deleted)) {
    rows.push(
      baseChangeFields(
        "Structural Repair Responsibility",
        "Rent abatement trigger for landlord failure to restore shortened from 30 consecutive days to 5 consecutive business days (qualitative timing / cash-flow risk).",
        favours,
        input,
        { structuralFacet: "rent_abatement_trigger" },
        ot,
        rt
      )
    );
  }
  if ((/90\s+consecutive/i.test(inserted) || /ninety/i.test(inserted.toLowerCase())) && /180\s+consecutive|one hundred and eighty/i.test(deleted)) {
    rows.push(
      baseChangeFields(
        "Structural Repair Responsibility",
        "Tenant termination right for uncured landlord failure shortened from 180 to 90 consecutive days (qualitative remedy timing).",
        favours,
        input,
        { structuralFacet: "termination_trigger" },
        ot,
        rt
      )
    );
  }

  if (!rows.length) {
    const clause = resolveClauseType("Structural Repair Responsibility", classified);
    const summary =
      classified?.summary?.trim()?.slice(0, 4000) ||
      combined.slice(0, 4000) ||
      "Structural repair responsibility change.";
    return [baseChangeFields(clause, summary, classified?.favours ?? "tenant", input, { tenantProportionateShare: tps }, ot, rt)];
  }
  return rows;
}

function expandRenewalRows(
  inserted: string,
  deleted: string,
  combined: string,
  input: AnalysisInput,
  classified: ClassifiedChange | null
): ChangeItem[] {
  const ot = deleted.slice(0, 12000);
  const rt = inserted.slice(0, 12000);
  const favours: Favours = classified?.favours ?? "tenant";
  const rows: ChangeItem[] = [];

  if (/(?:two|2)\s*\(?2\)?\s+renewal|two\s+renewal|second\s+renewal/i.test(`${inserted} ${deleted}`)) {
    rows.push(
      baseChangeFields(
        "Renewal Option Terms",
        "Number of renewal terms increased (additional renewal option period negotiated); modeled as economic value of an incremental renewal option.",
        favours,
        input,
        { renewalFacet: "extra_term" },
        ot,
        rt
      )
    );
  }
  if (/6\s*[–-]\s*12\s+months/i.test(inserted.toLowerCase()) && /9\s*[–-]\s*12|nine.*twelve/i.test(deleted.toLowerCase())) {
    rows.push(
      baseChangeFields(
        "Renewal Option Terms",
        "Renewal notice window broadened vs. base (e.g. earlier minimum notice); tenant-favorable administrative flexibility (qualitative).",
        favours,
        input,
        { renewalFacet: "notice_window" },
        ot,
        rt
      )
    );
  }
  if (/(?:two|2)\s*\(?2\)?\s*(?:full\s+)?calendar\s+months.*renewal|free\s+rent.*each\s+renewal|renewal term.*free/i.test(`${inserted} ${deleted}`.toLowerCase())) {
    rows.push(
      baseChangeFields(
        "Renewal Option Terms",
        "Additional Base Rent-free period at commencement of each Renewal Term (incremental renewal abatement vs. base).",
        favours,
        input,
        { renewalFacet: "renewal_free_rent" },
        ot,
        rt
      )
    );
  }
  if (
    /(?:not\s+)?less\s+than.*final|final\s+year.*rent|renewal\s+rent.*less/i.test(deleted.toLowerCase()) &&
    !/not\s+less\s+than.*final\s+year/i.test(inserted.toLowerCase())
  ) {
    rows.push(
      baseChangeFields(
        "Renewal Option Terms",
        "Renewal rent floor vs. in-place final-year rent removed; downside if market softens at renewal (benchmarked range vs. in-place rent).",
        favours,
        input,
        { renewalFacet: "rent_floor_removed" },
        ot,
        rt
      )
    );
  }

  if (!rows.length) {
    const clause = resolveClauseType("Renewal Option Terms", classified);
    const summary = classified?.summary?.trim()?.slice(0, 4000) || combined.slice(0, 4000) || "Renewal option change.";
    return [baseChangeFields(clause, summary, classified?.favours ?? "tenant", input, null, ot, rt)];
  }
  return rows;
}
