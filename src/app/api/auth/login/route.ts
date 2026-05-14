import { z } from "zod";
import { signInWithPassword, setAuthCookies } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const body = schema.parse(await request.json());
    const session = await signInWithPassword(body.email, body.password);
    await setAuthCookies(session.accessToken, session.refreshToken);
    return ok({ status: "logged_in" }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
