import { requireUserId } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";
import { getAnalysisWithChanges } from "@/lib/persistence";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const analysis = await getAnalysisWithChanges(userId, id);
    return ok(analysis, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
