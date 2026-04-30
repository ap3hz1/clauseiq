import { z } from "zod";
import { signInWithPassword, setAuthCookie } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const body = schema.parse(await request.json());
    const token = await signInWithPassword(body.email, body.password);
    await setAuthCookie(token);
    return ok({ status: "logged_in" }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
