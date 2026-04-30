import { z } from "zod";
import { signUpWithPassword, setAuthCookie } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const body = schema.parse(await request.json());
    const result = await signUpWithPassword(body.email, body.password);
    if (result.accessToken) {
      await setAuthCookie(result.accessToken);
      return ok({ status: "signed_up", requiresEmailConfirmation: false }, requestId);
    }
    return ok({ status: "signed_up_pending_confirmation", requiresEmailConfirmation: true }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
