import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { fail, ok, requestIdFromHeaders } from "@/lib/http";
import { saveMetric } from "@/lib/persistence";

const schema = z.object({
  eventType: z.string().min(2),
  payload: z.record(z.string(), z.unknown()).default({})
});

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const userId = await requireUserId();
    const body = schema.parse(await request.json());
    await saveMetric(userId, body.eventType, body.payload);
    return ok({ status: "recorded" }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
