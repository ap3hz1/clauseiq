/**
 * Writes scripts/clause-examples-corpus.json with ≥200 synthetic examples
 * across all 14 MVP clause types (PRD taxonomy labels).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "clause-examples-corpus.json");

const CLAUSE_TYPES = [
  "CAM / Operating Cost Cap",
  "Free Rent / Rent Abatement",
  "Tenant Improvement Allowance",
  "HVAC Capital Replacement Responsibility",
  "Roof Replacement Contribution",
  "Personal Guarantee Scope",
  "Asphalt / Parking Lot Cap",
  "Assignment and Subletting Rights",
  "Renewal Option Terms",
  "Structural Repair Responsibility",
  "Operating Cost Exclusions",
  "Demolition / Redevelopment Right",
  "Insurance Requirements",
  "Management Fee Cap"
];

const TARGET_PER_TYPE = 15; /* 14 * 15 = 210 ≥ PRD launch target */

function paragraph(kind, i, side) {
  const opener =
    side === "tenant"
      ? "Tenant acknowledges that the following limitation shall benefit Tenant."
      : "Landlord shall retain the protections described below for Landlord's benefit.";
  const body =
    {
      cam: `Operating Costs for calendar year ${2019 + (i % 7)} shall be capped such that Controllable Operating Costs may not increase by more than ${2 + (i % 4)}% over the prior year on a ${i % 2 === 0 ? "non-cumulative" : "cumulative"} basis, excluding utilities separately metered to tenants.`,
      rent: `Base Rent shall be abated for ${3 + (i % 5)} consecutive months following the Rent Commencement Date for Tenant's fit-out, subject to Tenant not being in monetary default beyond applicable cure periods.`,
      ti: `Landlord agrees to fund leasehold improvements in an amount of ${45 + i} dollars per rentable square foot, reimbursable only upon lien waivers and otherwise consistent with Landlord's standard disbursement procedures.`,
      hvac: `Responsibility for ${i % 2 === 0 ? "capital replacement of major HVAC components" : "repair and maintenance of packaged rooftop units"} shall rest with ${side === "tenant" ? "Landlord for replacement and Tenant for filters and coil cleaning only" : "Tenant including capital replacements amortizable through Operating Costs only if expressly stated"}.`,
      roof: `Any roof membrane replacement shall be amortized over a ${18 + (i % 8)}-year useful life; Tenant's contribution shall not exceed Tenant's Proportionate Share unless Tenant caused the replacement.`,
      guarantee: `Guarantor liability shall ${side === "tenant" ? "cap at twelve months of fixed rent and additional charges, extinguishing upon assignment to a qualified successor tenant " : "remain unlimited through the Term and any holdover "}without impairment carriers.`,
      asphalt: `Parking lot resurfacing costs allocated to Tenant shall not exceed ${0.35 + (i % 10) * 0.02} dollars per rentable square foot per annum and shall exclude patching unrelated to structural defects.`,
      assign: `On assignments ${side === "tenant" ? "Tenant retains sublease profits net of brokerage unless attributable to Landlord breach " : "Landlord participates in fifty percent of profits above in-place rent for remainder of Term "}subject to lender approvals.`,
      renew: `Renewal rent shall be ${i % 3 === 0 ? "greater of in-place rent and ninety-five percent of fair market rent" : "fair market rent determined by arbitrator if parties disagree within forty-five days"}, based on comparable leases.`,
      structural: `${side === "tenant" ? "Landlord maintains foundations and load-bearing elements without Operating Cost recovery except repairs triggered by Tenant" : "Tenant reimburses structural investigations attributable solely to Tenant's installations"}, excluding Ordinary Wear.`,
      exclusions: `Operating Costs exclude ${["capital amortization beyond GAAP", "leasing brokerage", "legal disputes among landlords", "remediation of baseline contamination"][i % 4]} unless mandated by government order.`,
      demo: `Landlord may terminate for redevelopment upon ${9 + (i % 12)} months' notice ${side === "landlord" ? "without termination compensation beyond statutory obligations " : "paying an amounts roughly equivalent to unamortized improvement allowances "}excluding casualty.`,
      insurance: `Tenant maintains commercial general liability of ${3 + (i % 6)} million dollars per occurrence, umbrella where customary, waiving subrogation as to mutual releases, naming Landlord additional insured.`,
      mgmt: `Third-party management fees included in Operating Costs shall not exceed ${3 + (i % 3)}.${i % 4}% of gross rents net of free rent abatements and shall exclude asset-management incentive fees.`
    }[kind] ?? "";
  return `${opener} ${body} This clause is labelled synthetic corpus variant ${i + 1} for retrieval benchmarking and shall not be construed as legal advice.`;
}

function kindForType(clauseType) {
  const map = {
    "CAM / Operating Cost Cap": "cam",
    "Free Rent / Rent Abatement": "rent",
    "Tenant Improvement Allowance": "ti",
    "HVAC Capital Replacement Responsibility": "hvac",
    "Roof Replacement Contribution": "roof",
    "Personal Guarantee Scope": "guarantee",
    "Asphalt / Parking Lot Cap": "asphalt",
    "Assignment and Subletting Rights": "assign",
    "Renewal Option Terms": "renew",
    "Structural Repair Responsibility": "structural",
    "Operating Cost Exclusions": "exclusions",
    "Demolition / Redevelopment Right": "demo",
    "Insurance Requirements": "insurance",
    "Management Fee Cap": "mgmt"
  };
  return map[clauseType];
}

const corpus = [];
for (const clause_type of CLAUSE_TYPES) {
  const kind = kindForType(clause_type);
  for (let i = 0; i < TARGET_PER_TYPE; i++) {
    const favours = i % 2 === 0 ? "tenant" : "landlord";
    corpus.push({
      clause_type,
      clause_text: paragraph(kind, i, favours),
      favours,
      source: "synthetic",
      confidence_weight: i % 7 === 0 ? 0.7 : 1.0,
      property_type: ["office", "retail", "industrial", "mixed_use"][i % 4]
    });
  }
}

writeFileSync(OUT, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
console.log(`Wrote ${corpus.length} examples to ${OUT}`);
