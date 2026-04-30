import { requireUserId } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const userId = await requireUserId();
    return ok({ userId }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
