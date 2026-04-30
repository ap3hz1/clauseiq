import { ok, requestIdFromHeaders } from "@/lib/http";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  return ok(
    {
      status: "ok",
      parserConfigured: Boolean(env.PARSER_SERVICE_URL),
      aiConfigured: Boolean(env.OPENAI_API_KEY && env.ANTHROPIC_API_KEY)
    },
    requestId
  );
}
