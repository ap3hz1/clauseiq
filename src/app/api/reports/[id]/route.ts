import { Buffer } from "node:buffer";
import { requireUserId } from "@/lib/auth";
import { fail, requestIdFromHeaders } from "@/lib/http";
import { getAnalysisWithChanges } from "@/lib/persistence";
import { renderReportText, textToSimplePdf } from "@/lib/report";

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
    const reportText = renderReportText({
      property: bundle.analysis.property_type,
      analyst: userId,
      createdAt: bundle.analysis.created_at,
      totalLow: bundle.analysis.total_impact_low,
      totalHigh: bundle.analysis.total_impact_high,
      signal: bundle.analysis.signal,
      changes: bundle.changes
    });
    const pdf = textToSimplePdf(reportText);
    const body = Buffer.from(pdf);
    return new Response(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="clauseiq-report-${id}.pdf"`
      }
    });
  } catch (error) {
    return fail(error, requestId);
  }
}
