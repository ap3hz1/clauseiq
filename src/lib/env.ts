import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  PARSER_SERVICE_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;

export function requireInProd(name: keyof typeof env): string | undefined {
  const value = env[name];
  if (env.NODE_ENV === "production" && !value) {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }
  return value;
}
