import type { AnalysisInput, AnalysisResult, ChangeItem } from "@/lib/types";
import { classifyRiskSignal } from "@/lib/riskSignal";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

const BUCKET = "leases";

interface SavedFiles {
  baseLeasePath: string;
  redlinePath: string;
  storageMode: "supabase" | "local-fallback";
}

async function uploadToStorage(file: File, objectPath: string): Promise<string> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return `local://${objectPath}`;
  }
  const bytes = await file.arrayBuffer();
  const { error } = await client.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: true
  });
  if (error) throw error;
  return objectPath;
}

export async function saveFiles(baseLease: File, redline: File, analysisId: string): Promise<SavedFiles & { baseLeaseName: string; redlineName: string }> {
  const timestamp = Date.now();
  const baseLeasePath = `uploads/${analysisId}/${timestamp}-base-${baseLease.name}`;
  const redlinePath = `uploads/${analysisId}/${timestamp}-redline-${redline.name}`;
  const client = getSupabaseAdminClient();
  const storageMode = client ? "supabase" : "local-fallback";

  await uploadToStorage(baseLease, baseLeasePath);
  await uploadToStorage(redline, redlinePath);
  return { baseLeasePath, redlinePath, storageMode, baseLeaseName: baseLease.name, redlineName: redline.name };
}

export async function persistAnalysis(
  userId: string,
  input: AnalysisInput,
  result: AnalysisResult,
  baseLeasePath: string,
  redlinePath: string,
  fileNames?: { baseLeaseName?: string; redlineName?: string }
) {
  const client = getSupabaseAdminClient();
  if (!client) return;

  const { error: analysisError } = await client.from("analyses").insert({
    id: result.id,
    user_id: userId,
    property_type: input.propertyType,
    province: input.province,
    gla_sqft: input.glaSqft,
    base_rent_psf: input.baseRentPsf,
    lease_term_years: input.leaseTermYears,
    operating_cost_psf: input.operatingCostPsf ?? null,
    operating_cost_psf_estimated: input.operatingCostPsfEstimated ?? false,
    discount_rate: input.discountRate ?? null,
    property_address: input.propertyAddress ?? null,
    landlord_party: input.landlordParty ?? null,
    tenant_party: input.tenantParty ?? null,
    analyst_name: input.analystName ?? null,
    base_lease_file: baseLeasePath,
    base_lease_filename: fileNames?.baseLeaseName ?? null,
    redline_file: redlinePath,
    redline_filename: fileNames?.redlineName ?? null,
    status: result.status,
    total_changes: result.totalChanges,
    total_impact_low: result.totalImpactLow,
    total_impact_high: result.totalImpactHigh,
    signal: result.signal,
    parser_path: result.parserPath ?? null,
    parser_confidence: result.parserConfidence ?? "low",
    analysis_version: result.analysisVersion ?? "2026.04-prod"
  });
  if (analysisError) throw analysisError;

  const payload = result.changes.map((c: ChangeItem) => ({
    id: c.id,
    analysis_id: result.id,
    clause_type: c.clauseType,
    change_summary: c.changeSummary,
    favours: c.favours,
    impact_low: c.impactLow,
    impact_high: c.impactHigh,
    confidence: c.confidence,
    method: c.method,
    recommendation: c.recommendation,
    user_notes: c.userNotes ?? null,
    original_text: c.originalText,
    redlined_text: c.redlinedText,
    dismissed: c.dismissed ?? false
  }));

  const { error: changesError } = await client.from("changes").insert(payload);
  if (changesError) throw changesError;
}

export async function listAnalyses(userId: string) {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("analyses")
    .select(
      "id, created_at, property_type, status, total_changes, total_impact_low, total_impact_high, signal, property_address, base_lease_filename, redline_filename"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

async function recomputeAnalysisTotals(client: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, analysisId: string) {
  const { data: rows, error } = await client
    .from("changes")
    .select("impact_low, impact_high, dismissed")
    .eq("analysis_id", analysisId);
  if (error) throw error;
  const list = rows ?? [];
  const active = list.filter((r) => !r.dismissed);
  const low = active.reduce((s, r) => s + (r.impact_low != null ? Number(r.impact_low) : 0), 0);
  const high = active.reduce((s, r) => s + (r.impact_high != null ? Number(r.impact_high) : 0), 0);
  const { error: upErr } = await client
    .from("analyses")
    .update({
      total_changes: active.length,
      total_impact_low: low,
      total_impact_high: high,
      signal: classifyRiskSignal(high)
    })
    .eq("id", analysisId);
  if (upErr) throw upErr;
}

/** Patch user-editable annotation fields on changes (PRD §3 step 4). */
export async function patchChangeAnnotations(
  userId: string,
  analysisId: string,
  patches: Array<{
    id: string;
    userNotes?: string | null;
    dismissed?: boolean;
    impactLow?: number | null;
    impactHigh?: number | null;
  }>
): Promise<number> {
  const client = getSupabaseAdminClient();
  if (!client) return 0;
  if (!patches.length) return 0;

  // Verify ownership before patching.
  const { data: analysis, error: ownerError } = await client
    .from("analyses")
    .select("id")
    .eq("id", analysisId)
    .eq("user_id", userId)
    .single();
  if (ownerError || !analysis) return 0;

  let count = 0;
  for (const p of patches) {
    const update: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(p, "userNotes")) update.user_notes = p.userNotes ?? null;
    if (Object.prototype.hasOwnProperty.call(p, "dismissed")) update.dismissed = Boolean(p.dismissed);
    if (Object.prototype.hasOwnProperty.call(p, "impactLow")) update.impact_low = p.impactLow ?? null;
    if (Object.prototype.hasOwnProperty.call(p, "impactHigh")) update.impact_high = p.impactHigh ?? null;
    if (Object.keys(update).length === 0) continue;
    const { error } = await client
      .from("changes")
      .update(update)
      .eq("id", p.id)
      .eq("analysis_id", analysisId);
    if (!error) count += 1;
  }
  if (count > 0) await recomputeAnalysisTotals(client, analysisId);
  return count;
}

/** PostgREST: `.single()` with zero rows (or no longer exactly one). */
function isNoRowError(err: { code?: string } | null): boolean {
  return err?.code === "PGRST116";
}

export async function getAnalysisWithChanges(userId: string, analysisId: string) {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data: analysis, error: aError } = await client
    .from("analyses")
    .select("*")
    .eq("id", analysisId)
    .eq("user_id", userId)
    .single();
  if (aError) {
    if (isNoRowError(aError)) return null;
    throw aError;
  }
  const { data: changes, error: cError } = await client.from("changes").select("*").eq("analysis_id", analysisId).order("id");
  if (cError) throw cError;
  return { analysis, changes: changes ?? [] };
}

export async function saveMetric(userId: string, eventType: string, payload: Record<string, unknown>) {
  const client = getSupabaseAdminClient();
  if (!client) return;
  const { error } = await client.from("pilot_metrics").insert({
    user_id: userId,
    event_type: eventType,
    payload
  });
  if (error) throw error;
}

export async function listMetrics(userId: string) {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("pilot_metrics")
    .select("event_type, payload, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}
