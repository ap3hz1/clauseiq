import { buildChangesFromParser, buildStubChanges } from "@/lib/quantification";
import type { AnalysisInput, AnalysisResult } from "@/lib/types";
import { persistAnalysis, saveFiles, saveMetric } from "@/lib/persistence";
import { classifyRiskSignal } from "@/lib/riskSignal";
import { ApiError, checkRateLimit, fail, ok, requestIdFromHeaders, validationMessageFromZod } from "@/lib/http";
import { ZodError } from "zod";
import { allowStubParserFallback, env } from "@/lib/env";
import { parseInput, validateLeaseFile } from "@/lib/validation";
import { requireUserId } from "@/lib/auth";
import { classifyChanges } from "@/lib/rag";
import { enforceOrigin } from "@/lib/security";
import { filterNoiseParsedChanges } from "@/lib/changeFilters";
import { applyParserConfidenceCascade } from "@/lib/parserConfidencePolicy";

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

type StreamSender = (obj: Record<string, unknown>) => void;

async function runLeaseAnalysisFromForm(
  request: Request,
  userId: string,
  sendProgress?: StreamSender
): Promise<AnalysisResult> {
  const progress = (message: string, step?: string) => {
    sendProgress?.({ kind: "progress", message, step });
  };

  progress("Validating lease files…", "validate");

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
    operatingCostPsf: form.get("operatingCostPsf"),
    discountRate: form.get("discountRate"),
    propertyAddress: form.get("propertyAddress"),
    landlordParty: form.get("landlordParty"),
    tenantParty: form.get("tenantParty"),
    analystName: form.get("analystName")
  });

  const analysisStartedAt = Date.now();
  const stubAllowed = allowStubParserFallback();

  progress("Extracting edits from documents (parser may take ~15–25s)…", "parse");
  const parsed = await extractWithParser(baseLease, redlineLease);
  const rawDetected = parsed?.changes_detected ?? [];
  const rows = rawDetected.length ? filterNoiseParsedChanges(rawDetected) : [];

  if (!stubAllowed) {
    if (!env.PARSER_SERVICE_URL) {
      throw new ApiError(
        503,
        "parser_unconfigured",
        "Document parsing is not configured. Set PARSER_SERVICE_URL on the server. For local demos only, use NODE_ENV=development with ALLOW_STUB_PARSER=true."
      );
    }
    if (!rawDetected.length) {
      throw new ApiError(
        502,
        "parser_empty",
        "The document parser returned no changes. Verify files and parser health, then retry."
      );
    }
    if (!rows.length) {
      throw new ApiError(
        422,
        "parser_no_substantive_changes",
        "No substantive lease changes were detected after extraction. Try different files or inspect parser output."
      );
    }
  }

  let changes: AnalysisResult["changes"];
  let parserPath: string;
  let parserConfidence: AnalysisResult["parserConfidence"];

  if (rows.length) {
    progress(`Matching ${rows.length} parsed changes to clause types (embeddings + model review)…`, "classify_prepare");
    const classified = await classifyChanges(rows, input, {
      onProgress: (current, total) => progress(`Classifying change ${current} of ${total}…`, "classify")
    });
    changes = buildChangesFromParser(input, rows, classified);
    parserPath = parsed!.path;
    parserConfidence = parsed!.confidence;
  } else {
    changes = buildStubChanges(input);
    parserPath = "stub";
    parserConfidence = "low";
    if (stubAllowed) {
      if (!env.PARSER_SERVICE_URL) {
        progress("Parser service not configured — using baseline clause templates.", "stub_noserver");
      } else if (!rawDetected.length) {
        progress("Parser returned no edits — using baseline clause templates.", "stub_noparse");
      } else {
        progress("Parser returned no substantive edits — using baseline clause templates.", "stub_filtered");
      }
    }
  }

  progress("Computing lease-risk estimates…", "quantify");

  changes = applyParserConfidenceCascade(changes, parserPath, parserConfidence);

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
    signal: classifyRiskSignal(totals.high),
    changes,
    operatingCostPsfUsed: input.operatingCostPsf ?? null,
    operatingCostPsfEstimated: input.operatingCostPsfEstimated ?? false,
    discountRateUsed: input.discountRate ?? 0.06
  };

  progress("Uploading lease files to storage…", "storage");
  const files = await saveFiles(baseLease, redlineLease, result.id);
  result.storageMode = files.storageMode;

  progress("Saving analysis…", "persist");
  await persistAnalysis(userId, input, result, files.baseLeasePath, files.redlinePath, {
    baseLeaseName: files.baseLeaseName,
    redlineName: files.redlineName
  });

  try {
    await saveMetric(userId, "analysis_completed", {
      analysis_id: result.id,
      total_changes: result.totalChanges,
      signal: result.signal,
      duration_ms: Date.now() - analysisStartedAt
    });
  } catch (metricErr) {
    console.warn("[clauseiq] pilot_metrics analysis_completed insert failed:", metricErr);
  }

  return result;
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const streamProgress = request.headers.get("x-clauseiq-progress-stream") === "1";

  try {
    enforceOrigin(request.headers);
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!checkRateLimit(`upload:${ip}`, 25)) {
      throw new ApiError(429, "rate_limited", "Too many requests. Try again later.");
    }
    const userId = await requireUserId();

    if (!streamProgress) {
      const result = await runLeaseAnalysisFromForm(request, userId);
      return ok(result, requestId);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };
        try {
          const result = await runLeaseAnalysisFromForm(request, userId, send);
          send({ kind: "complete", requestId, data: result });
        } catch (error) {
          if (error instanceof ApiError) {
            send({
              kind: "error",
              requestId,
              code: error.code,
              message: error.message,
              status: error.status
            });
          } else if (error instanceof ZodError) {
            const message = validationMessageFromZod(error);
            console.warn(`[${requestId}] validation:`, message);
            send({
              kind: "error",
              requestId,
              code: "validation_error",
              message,
              status: 400
            });
          } else {
            console.error(`[${requestId}]`, error);
            const dev = process.env.NODE_ENV === "development";
            send({
              kind: "error",
              requestId,
              code: "internal_error",
              message: "Unexpected error processing request.",
              status: 500,
              ...(dev && error instanceof Error ? { debug: error.message } : {})
            });
          }
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId
      }
    });
  } catch (error) {
    return fail(error, requestId);
  }
}
