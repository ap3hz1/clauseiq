import { ApiError } from "@/lib/http";
import { env } from "@/lib/env";

export function enforceOrigin(headers: Headers) {
  const configured = env.ALLOWED_ORIGINS;
  if (!configured) return;
  const origin = headers.get("origin");
  if (!origin) return;
  const allowed = configured.split(",").map((x) => x.trim());
  if (!allowed.includes(origin)) {
    throw new ApiError(403, "invalid_origin", "Origin is not allowed.");
  }
}
