# Supabase migrations

Apply migrations in order against the project your `.env.local` points to.

Each file is idempotent (`add column if not exists`, `create * if not exists`), so it
is safe to re-run.

## Local / shared dev project

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260514_audit_pass_2.sql
```

Or paste the file contents into **Supabase Studio → SQL Editor → Run**.

## Available migrations

| File | Purpose |
| --- | --- |
| `20260514_audit_pass_2.sql` | Adds cover/personalization columns to `analyses` (property_address, landlord_party, tenant_party, analyst_name) and engine-config columns (operating_cost_psf_estimated, discount_rate), plus original filename columns. Required for Commit 3 of the Pass 2 audit. |
