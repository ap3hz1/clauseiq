import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function requestIdFromHeaders(headers: Headers): string {
  return headers.get("x-request-id") ?? crypto.randomUUID();
}

export function ok<T>(data: T, requestId: string, init?: ResponseInit) {
  return NextResponse.json({ requestId, data }, init);
}

export function fail(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { requestId, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  return NextResponse.json(
    {
      requestId,
      error: {
        code: "internal_error",
        message: "Unexpected error processing request."
      }
    },
    { status: 500 }
  );
}

const bucket = new Map<string, { count: number; resetAt: number }>();
export function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const current = bucket.get(key);
  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= maxPerMinute) return false;
  current.count += 1;
  return true;
}
