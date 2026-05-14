import { requireUserId } from "@/lib/auth";
import { fail, requestIdFromHeaders } from "@/lib/http";
import { getAnalysisWithChanges } from "@/lib/persistence";
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
    const html = buildReportHtml({
      property: bundle.analysis.property_type,
      analyst: userId,
      createdAt: bundle.analysis.created_at,
      totalLow: bundle.analysis.total_impact_low,
      totalHigh: bundle.analysis.total_impact_high,
      signal: bundle.analysis.signal,
      changes: bundle.changes
    });
    const pdf = await renderReportPdf(html);
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
