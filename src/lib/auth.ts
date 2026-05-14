import { cookies } from "next/headers";
import { CLAUSEIQ_ACCESS_COOKIE, CLAUSEIQ_REFRESH_COOKIE } from "@/lib/authCookies";
import { ApiError } from "@/lib/http";
import { getSupabaseAdminClient, getSupabaseAnonClient } from "@/lib/supabase-server";

const COOKIE_ACCESS = CLAUSEIQ_ACCESS_COOKIE;
const COOKIE_REFRESH = CLAUSEIQ_REFRESH_COOKIE;

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

export async function setAuthCookies(accessToken: string, refreshToken: string | null | undefined) {
  const jar = await cookies();
  jar.set(COOKIE_ACCESS, accessToken, {
    ...cookieOpts,
    maxAge: 60 * 60 * 8
  });
  if (refreshToken) {
    jar.set(COOKIE_REFRESH, refreshToken, {
      ...cookieOpts,
      maxAge: 60 * 60 * 24 * 30
    });
  }
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_ACCESS);
  jar.delete(COOKIE_REFRESH);
}

/**
 * Validates JWT when possible; if expired but refresh cookie exists, refreshes tokens (updates cookies).
 */
export async function requireUserId(): Promise<string> {
  const jar = await cookies();
  const accessToken = jar.get(COOKIE_ACCESS)?.value;
  const refreshToken = jar.get(COOKIE_REFRESH)?.value;

  const admin = getSupabaseAdminClient();
  if (!admin) throw new ApiError(500, "missing_supabase", "Supabase admin client not configured.");

  if (accessToken) {
    const { data, error } = await admin.auth.getUser(accessToken);
    if (!error && data.user) return data.user.id;
  }

  if (!refreshToken) {
    if (!accessToken) throw new ApiError(401, "unauthorized", "Not authenticated.");
    throw new ApiError(401, "invalid_session", "Session is invalid.");
  }

  const anon = getSupabaseAnonClient();
  if (!anon) throw new ApiError(500, "missing_supabase", "Supabase anon client not configured.");

  const { data: refreshed, error: refreshErr } = await anon.auth.refreshSession({
    refresh_token: refreshToken
  });

  if (refreshErr || !refreshed.session?.access_token) {
    jar.delete(COOKIE_ACCESS);
    jar.delete(COOKIE_REFRESH);
    throw new ApiError(401, "invalid_session", "Session is invalid.");
  }

  const sess = refreshed.session;
  await setAuthCookies(sess.access_token, sess.refresh_token ?? refreshToken);

  const { data: userAfter, error: userErr } = await admin.auth.getUser(sess.access_token);
  if (userErr || !userAfter.user) {
    throw new ApiError(401, "invalid_session", "Session is invalid.");
  }
  return userAfter.user.id;
}

export async function signInWithPassword(email: string, password: string) {
  const anon = getSupabaseAnonClient();
  if (!anon) throw new ApiError(500, "missing_supabase", "Supabase anon client not configured.");
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) throw new ApiError(401, "invalid_credentials", "Invalid credentials.");
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token
  };
}

export async function signUpWithPassword(email: string, password: string) {
  const anon = getSupabaseAnonClient();
  if (!anon) throw new ApiError(500, "missing_supabase", "Supabase anon client not configured.");
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error) throw new ApiError(400, "signup_failed", error.message);
  const sess = data.session;
  return {
    accessToken: sess?.access_token ?? null,
    refreshToken: sess?.refresh_token ?? null,
    requiresEmailConfirmation: !sess?.access_token
  };
}
