import type { ClauseType } from "@/lib/engine/quantification";

/** True if text describes a CAM / controllable OpEx cap, not merely "Operating Costs" in another article. */
export function looksLikeCamCapProvision(inserted: string, deleted: string): boolean {
  const t = `${inserted} ${deleted}`.toLowerCase();
  if (t.includes("cam cap")) return true;
  if (t.includes("non-cumulative")) return true;
  if (t.includes("controllable operating costs")) return true;
  if (/\b\d+(?:\.\d+)?\s*%\s*(?:over|increase)/i.test(t)) return true;
  if (/shall\s+not\s+increase\s+by\s+more\s+than/i.test(t) && t.includes("operating")) return true;
  return false;
}

/**
 * First-match wins: specific clauses before generic "operating" / CAM.
 */
export function inferClauseTypeFromText(inserted: string, deleted: string): ClauseType | "Unclassified Change" {
  const t = `${inserted} ${deleted}`;
  const lower = t.toLowerCase();

  if (/\bdemolition\b/i.test(t) && /(notice|terminate|redevelopment)/i.test(t)) return "Demolition / Redevelopment Right";
  if (
    /structural elements/i.test(t) ||
    /structural repair/i.test(t) ||
    (/sole cost and expense/i.test(t) &&
      /not recoverable through operating costs/i.test(lower) &&
      /structural|base building|hvac systems serving multiple|elevator/i.test(lower))
  ) {
    return "Structural Repair Responsibility";
  }
  if (/personal guarantee|\bguarantor\b/i.test(t) && /guarantee/i.test(lower)) return "Personal Guarantee Scope";
  if ((/renewal option|renewal term|renewal notice|fair market rent/i.test(lower)) && /renew/i.test(lower)) {
    return "Renewal Option Terms";
  }
  if (
    /assign this lease|sublet|subletting|transfer request|subtenant|permitted transferee/i.test(lower) ||
    (/transfer\b/i.test(lower) && /landlord/i.test(lower))
  ) {
    return "Assignment and Subletting Rights";
  }
  if (/commercial general liability|tenant's legal liability|all-risks.*property insurance|certificate of insurance/i.test(lower)) {
    return "Insurance Requirements";
  }
  if (/free rent|rent abatement|free rent period/i.test(lower)) return "Free Rent / Rent Abatement";
  if (/tenant improvement|\bti allowance\b|improvement allowance/i.test(lower) && (/per rentable square foot|per\s+sq/i.test(lower) || /\$\s*[\d,]+.*per.*square\s+foot/i.test(t))) {
    return "Tenant Improvement Allowance";
  }
  if (/\broof\b/i.test(lower) && /(replacement|repair|membrane)/i.test(lower)) return "Roof Replacement Contribution";
  if (/\bhvac\b|heating, ventilating|air conditioning/i.test(lower) && /(capital|replacement|system)/i.test(lower)) {
    return "HVAC Capital Replacement Responsibility";
  }
  if (
    /management fee/i.test(lower) &&
    (/gross revenues|% of the gross|management fee cap/i.test(lower) || /\d+\.?\d*\s*%\s*of\s+the\s+gross/i.test(lower))
  ) {
    return "Management Fee Cap";
  }
  if (looksLikeCamCapProvision(inserted, deleted)) return "CAM / Operating Cost Cap";
  if (/asphalt|parking lot cap/i.test(lower)) return "Asphalt / Parking Lot Cap";
  if (/operating costs shall expressly exclude|exclusions.*operating/i.test(lower)) return "Operating Cost Exclusions";
  return "Unclassified Change";
}
