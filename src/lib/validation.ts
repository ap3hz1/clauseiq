import { z } from "zod";
import type { AnalysisInput } from "@/lib/types";

export const uploadFormSchema = z.object({
  propertyType: z.enum(["industrial", "office", "retail", "mixed_use"]),
  province: z.enum(["ON", "BC", "AB"]),
  glaSqft: z.coerce.number().min(100),
  baseRentPsf: z.coerce.number().min(1),
  leaseTermYears: z.coerce.number().min(1),
  operatingCostPsf: z.coerce.number().min(0).optional()
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
  return uploadFormSchema.parse({
    propertyType: raw.propertyType,
    province: raw.province,
    glaSqft: raw.glaSqft,
    baseRentPsf: raw.baseRentPsf,
    leaseTermYears: raw.leaseTermYears,
    operatingCostPsf: raw.operatingCostPsf
  });
}
