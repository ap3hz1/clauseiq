import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseClientKey = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false
    }
  });
}

export function getSupabaseAnonClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseClientKey) return null;
  return createClient(supabaseUrl, supabaseClientKey, {
    auth: { persistSession: false }
  });
}
