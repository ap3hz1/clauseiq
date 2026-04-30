# ClauseIQ Deployment and UAT Checklist

## Infrastructure

- [ ] Deploy web app to Vercel.
- [ ] Deploy parser service to Railway/Render.
- [ ] Create Supabase project and run `supabase/schema.sql`.
- [ ] Create Supabase storage bucket `leases`.

## Secrets and Environment

- [ ] Set `SUPABASE_URL`.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Set `SUPABASE_ANON_KEY`.
- [ ] Set `PARSER_SERVICE_URL`.
- [ ] Set `OPENAI_API_KEY` (recommended).
- [ ] Set `ANTHROPIC_API_KEY` (recommended).

## Security and Access

- [ ] Validate auth signup/login/logout flow.
- [ ] Validate user-scoped analysis history.
- [ ] Verify RLS behavior with two user accounts.
- [ ] Verify rate limiting on upload API.

## Reliability

- [ ] Validate DOCX tracked extraction path.
- [ ] Validate DOCX clean diff fallback.
- [ ] Validate PDF diff fallback (low confidence).
- [ ] Validate parser timeout behavior and graceful fallback.

## Product Validation

- [ ] Upload at least 20 pilot leases (mixed property types).
- [ ] Confirm analysis completion time target.
- [ ] Confirm report PDF exports and annotations.
- [ ] Capture feedback events in pilot dashboard.

## Observability

- [ ] Inspect Vercel logs for API errors.
- [ ] Inspect parser logs for extract failures.
- [ ] Confirm metrics ingestion in `pilot_metrics`.
