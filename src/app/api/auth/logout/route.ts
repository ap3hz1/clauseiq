import { clearAuthCookie } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    await clearAuthCookie();
    return ok({ status: "logged_out" }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
