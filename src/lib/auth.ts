import { cookies } from "next/headers";
import { ApiError } from "@/lib/http";
import { getSupabaseAdminClient, getSupabaseAnonClient } from "@/lib/supabase-server";

const COOKIE_NAME = "clauseiq_access_token";

export async function setAuthCookie(accessToken: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function requireUserId(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) throw new ApiError(401, "unauthorized", "Not authenticated.");
  const admin = getSupabaseAdminClient();
  if (!admin) throw new ApiError(500, "missing_supabase", "Supabase admin client not configured.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "invalid_session", "Session is invalid.");
  return data.user.id;
}

export async function signInWithPassword(email: string, password: string) {
  const anon = getSupabaseAnonClient();
  if (!anon) throw new ApiError(500, "missing_supabase", "Supabase anon client not configured.");
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) throw new ApiError(401, "invalid_credentials", "Invalid credentials.");
  return data.session.access_token;
}

export async function signUpWithPassword(email: string, password: string) {
  const anon = getSupabaseAnonClient();
  if (!anon) throw new ApiError(500, "missing_supabase", "Supabase anon client not configured.");
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error) throw new ApiError(400, "signup_failed", error.message);
  return {
    accessToken: data.session?.access_token ?? null,
    requiresEmailConfirmation: !data.session?.access_token
  };
}
