import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  PARSER_SERVICE_URL: z.string().url().optional(),
  /** Development only: allow stub parser when true with NODE_ENV=development (PRD audit plan). */
  ALLOW_STUB_PARSER: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;

/** Development-only escape hatch: stub/demo analyses without a parser service (PRD implementation plan). */
export function allowStubParserFallback(): boolean {
  return env.NODE_ENV === "development" && env.ALLOW_STUB_PARSER === "true";
}

export function requireInProd(name: keyof typeof env): string | undefined {
  const value = env[name];
  if (env.NODE_ENV === "production" && !value) {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }
  return value;
}
