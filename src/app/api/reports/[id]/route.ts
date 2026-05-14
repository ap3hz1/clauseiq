import { requireUserId } from "@/lib/auth";
import { fail, requestIdFromHeaders } from "@/lib/http";
import { getAnalysisWithChanges, saveMetric } from "@/lib/persistence";
import { buildReportHtml, renderReportPdf } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const bundle = await getAnalysisWithChanges(userId, id);
    if (!bundle) {
      return new Response(JSON.stringify({ requestId, error: { code: "not_found", message: "Analysis not found." } }), {
        status: 404
      });
    }
    const a = bundle.analysis as Record<string, unknown>;
    const changesForReport = bundle.changes.map((row: Record<string, unknown>) => ({
      clause_type: String(row.clause_type ?? ""),
      change_summary: String(row.change_summary ?? ""),
      favours: row.favours != null ? String(row.favours) : null,
      impact_low: row.impact_low != null ? Number(row.impact_low) : null,
      impact_high: row.impact_high != null ? Number(row.impact_high) : null,
      confidence: String(row.confidence ?? ""),
      method: String(row.method ?? ""),
      recommendation: String(row.recommendation ?? ""),
      user_notes: row.user_notes != null ? String(row.user_notes) : null,
      dismissed: Boolean(row.dismissed)
    }));
    const html = buildReportHtml({
      property: bundle.analysis.property_type,
      propertyType: bundle.analysis.property_type,
      propertyAddress: (a.property_address as string | null) ?? null,
      landlordParty: (a.landlord_party as string | null) ?? null,
      tenantParty: (a.tenant_party as string | null) ?? null,
      analystName: (a.analyst_name as string | null) ?? null,
      analyst: userId,
      createdAt: bundle.analysis.created_at,
      totalLow: bundle.analysis.total_impact_low,
      totalHigh: bundle.analysis.total_impact_high,
      signal: bundle.analysis.signal,
      discountRate: typeof a.discount_rate === "number" ? a.discount_rate : null,
      operatingCostPsfUsed: typeof a.operating_cost_psf === "number" ? a.operating_cost_psf : null,
      operatingCostPsfEstimated: Boolean(a.operating_cost_psf_estimated),
      parserPath: (a.parser_path as string | null) ?? null,
      parserConfidence: (a.parser_confidence as string | null) ?? null,
      changes: changesForReport
    });
    const pdf = await renderReportPdf(html);
    try {
      await saveMetric(userId, "report_downloaded", { analysis_id: id });
    } catch (metricErr) {
      console.warn("[clauseiq] pilot_metrics report_downloaded insert failed:", metricErr);
    }
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="clauseiq-report-${id}.pdf"`
      }
    });
  } catch (error) {
    return fail(error, requestId);
  }
}
