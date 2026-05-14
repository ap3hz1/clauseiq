import { buildChangesFromParser, buildStubChanges } from "@/lib/quantification";
import type { AnalysisInput, AnalysisResult, RiskSignal } from "@/lib/types";
import { persistAnalysis, saveFiles } from "@/lib/persistence";
import { ApiError, checkRateLimit, fail, ok, requestIdFromHeaders } from "@/lib/http";
import { env } from "@/lib/env";
import { parseInput, validateLeaseFile } from "@/lib/validation";
import { requireUserId } from "@/lib/auth";
import { classifyChanges } from "@/lib/rag";
import { enforceOrigin } from "@/lib/security";
import { filterNoiseParsedChanges } from "@/lib/changeFilters";

function classifySignal(high: number): RiskSignal {
  if (high < 75000) return "manageable";
  if (high < 250000) return "material";
  return "significant";
}

interface ParserResult {
  path: string;
  confidence: "high" | "medium" | "low";
  changes_detected?: Array<{
    change_type: string;
    inserted_text: string;
    deleted_text: string;
    before_text?: string;
    after_text?: string;
  }>;
}

async function callParser(endpoint: string, payload: FormData): Promise<ParserResult | null> {
  const parserUrl = env.PARSER_SERVICE_URL;
  if (!parserUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${parserUrl}${endpoint}`, {
      method: "POST",
      body: payload,
      signal: controller.signal
    });
    if (!response.ok) return null;
    return (await response.json()) as ParserResult;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractWithParser(baseLease: File, redlineLease: File): Promise<ParserResult | null> {
  const parserUrl = env.PARSER_SERVICE_URL;
  if (!parserUrl) return null;

  const extension = redlineLease.name.toLowerCase();
  const baseExt = baseLease.name.toLowerCase();
  const payload = new FormData();
  payload.set("base_file", baseLease);
  payload.set("redline_file", redlineLease);
  if (extension.endsWith(".docx")) {
    const extracted = await callParser("/extract/docx-tracked", (() => {
      const f = new FormData();
      f.set("file", redlineLease);
      return f;
    })());
    if (extracted?.changes_detected?.length) return extracted;
    const basePayload = new FormData();
    basePayload.set("file", baseLease);
    const baseExtracted = await callParser("/extract/docx-tracked", basePayload);
    if (baseExtracted?.changes_detected?.length) return baseExtracted;
  }
  if (extension.endsWith(".docx") && baseExt.endsWith(".docx")) {
    const clean = await callParser("/extract/docx-diff", payload);
    if (clean) return clean;
  }
  if (extension.endsWith(".pdf") && baseExt.endsWith(".pdf")) {
    const pdf = await callParser("/extract/pdf-diff", payload);
    if (pdf) return pdf;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const requestId = requestIdFromHeaders(request.headers);
    enforceOrigin(request.headers);
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!checkRateLimit(`upload:${ip}`, 25)) {
      throw new ApiError(429, "rate_limited", "Too many requests. Try again later.");
    }
    const userId = await requireUserId();
    const form = await request.formData();
    const baseLease = form.get("baseLease");
    const redlineLease = form.get("redlineLease");
    if (!(baseLease instanceof File) || !(redlineLease instanceof File)) {
      throw new ApiError(400, "invalid_files", "Both lease files are required.");
    }
    validateLeaseFile(baseLease, "Base lease");
    validateLeaseFile(redlineLease, "Redline lease");

    const input: AnalysisInput = parseInput({
      propertyType: form.get("propertyType"),
      province: form.get("province"),
      glaSqft: form.get("glaSqft"),
      baseRentPsf: form.get("baseRentPsf"),
      leaseTermYears: form.get("leaseTermYears"),
      operatingCostPsf: form.get("operatingCostPsf")
    });

    let changes = buildStubChanges(input);
    let parserPath = "stub";
    let parserConfidence: AnalysisResult["parserConfidence"] = "low";
    const parsed = await extractWithParser(baseLease, redlineLease);
    if (parsed?.changes_detected?.length) {
      const rows = filterNoiseParsedChanges(parsed.changes_detected);
      if (rows.length) {
        const classified = await classifyChanges(rows, input);
        const parserMapped = buildChangesFromParser(input, rows);
        changes = parserMapped.map((item, idx) => ({
          ...item,
          clauseType: classified[idx]?.clauseType ?? item.clauseType,
          changeSummary: classified[idx]?.summary ?? item.changeSummary,
          favours: classified[idx]?.favours ?? item.favours,
          confidence: classified[idx]?.confidence ?? item.confidence
        }));
        parserPath = parsed.path;
        parserConfidence = parsed.confidence;
      }
    }
    const totals = changes.reduce(
      (acc, c) => {
        acc.low += c.impactLow ?? 0;
        acc.high += c.impactHigh ?? 0;
        return acc;
      },
      { low: 0, high: 0 }
    );
    const result: AnalysisResult = {
      id: crypto.randomUUID(),
      status: "complete",
      storageMode: "local-fallback",
      parserPath,
      parserConfidence,
      analysisVersion: "2026.04-prod",
      totalChanges: changes.length,
      totalImpactLow: totals.low,
      totalImpactHigh: totals.high,
      signal: classifySignal(totals.high),
      changes
    };

    const files = await saveFiles(baseLease, redlineLease, result.id);
    result.storageMode = files.storageMode;
    await persistAnalysis(userId, input, result, files.baseLeasePath, files.redlinePath);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestIdFromHeaders(request.headers));
  }
}
