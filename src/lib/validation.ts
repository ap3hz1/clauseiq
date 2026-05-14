import { z } from "zod";
import type { AnalysisInput } from "@/lib/types";
import { DEFAULT_OPERATING_COST_PSF } from "@/lib/actuarial";

/** Empty / missing FormData → undefined (never NaN). Invalid numeric text → undefined for optional fields. */
function preprocessOptionalString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return undefined;
}

function preprocessOptionalNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim().length === 0) return undefined;
  const n = Number(typeof v === "string" ? v.trim() : v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

const optionalString = z.preprocess(preprocessOptionalString, z.string().min(1).max(500).optional());

const optionalNumber = z.preprocess(preprocessOptionalNumber, z.number().min(0).optional());

export const uploadFormSchema = z.object({
  propertyType: z.enum(["industrial", "office", "retail", "mixed_use"]),
  province: z.enum(["ON", "BC", "AB"]),
  glaSqft: z.coerce.number().min(100),
  baseRentPsf: z.coerce.number().min(1),
  leaseTermYears: z.coerce.number().min(1),
  operatingCostPsf: optionalNumber,
  discountRate: z.preprocess(preprocessOptionalNumber, z.number().min(0).max(0.25).optional()),
  propertyAddress: optionalString,
  landlordParty: optionalString,
  tenantParty: optionalString,
  analystName: optionalString
});

const allowedExt = [".docx", ".pdf"];
export function validateLeaseFile(file: File, label: string) {
  const lower = file.name.toLowerCase();
  if (!allowedExt.some((ext) => lower.endsWith(ext))) {
    throw new Error(`${label} must be DOCX or PDF.`);
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error(`${label} exceeds max size (20MB).`);
  }
}

export function parseInput(raw: Record<string, FormDataEntryValue | null>): AnalysisInput {
  const parsed = uploadFormSchema.parse({
    propertyType: raw.propertyType,
    province: raw.province,
    glaSqft: raw.glaSqft,
    baseRentPsf: raw.baseRentPsf,
    leaseTermYears: raw.leaseTermYears,
    operatingCostPsf: raw.operatingCostPsf,
    discountRate: raw.discountRate,
    propertyAddress: raw.propertyAddress,
    landlordParty: raw.landlordParty,
    tenantParty: raw.tenantParty,
    analystName: raw.analystName
  });

  const estimated = parsed.operatingCostPsf == null;
  const operatingCostPsf = parsed.operatingCostPsf ?? DEFAULT_OPERATING_COST_PSF[parsed.propertyType];

  return {
    propertyType: parsed.propertyType,
    province: parsed.province,
    glaSqft: parsed.glaSqft,
    baseRentPsf: parsed.baseRentPsf,
    leaseTermYears: parsed.leaseTermYears,
    operatingCostPsf,
    operatingCostPsfEstimated: estimated,
    discountRate: parsed.discountRate,
    propertyAddress: parsed.propertyAddress,
    landlordParty: parsed.landlordParty,
    tenantParty: parsed.tenantParty,
    analystName: parsed.analystName
  };
}
