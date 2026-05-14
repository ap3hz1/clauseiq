import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { ApiError, fail, ok, requestIdFromHeaders } from "@/lib/http";
import { patchChangeAnnotations } from "@/lib/persistence";

const patchSchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.string().min(1),
        userNotes: z.string().max(8000).nullable().optional(),
        dismissed: z.boolean().optional(),
        impactLow: z.union([z.number().finite(), z.null()]).optional(),
        impactHigh: z.union([z.number().finite(), z.null()]).optional()
      })
    )
    .max(500)
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) throw new ApiError(400, "invalid_body", "Body must be JSON with a `changes` array.");
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_body", parsed.error.issues.map((i) => i.message).join("; "));
    }
    const updated = await patchChangeAnnotations(userId, id, parsed.data.changes);
    return ok({ updated }, requestId);
  } catch (error) {
    return fail(error, requestId);
  }
}
