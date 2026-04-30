import { requireUserId } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";
import { listAnalyses } from "@/lib/persistence";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const userId = await requireUserId();
    const analyses = await listAnalyses(userId);
    return ok(analyses, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
