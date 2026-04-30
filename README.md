# ClauseIQ MVP

MVP scaffold for commercial lease risk quantification.

## Included

- Next.js app with upload form + Change Risk Register UI
- `POST /api/upload` multipart endpoint
- Supabase storage + DB persistence hooks
- Deterministic quantification starter formulas (CAM cap, free rent)
- Python parser microservice skeleton in `parser-service`
- Auth API + session cookie workflow
- Analysis history + PDF export endpoint
- Pilot metrics endpoint + dashboard
- RAG classification orchestration (OpenAI embeddings + Anthropic classification with fallback)

## Setup

1. Copy env vars:

```bash
cp .env.example .env.local
```

2. Start web app:

```bash
npm install
npm run dev
```

3. (Optional) start parser service:

```bash
cd parser-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Supabase

- Run `supabase/schema.sql` in your project SQL editor.
- Create storage bucket named `leases`.
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.
- Optional AI env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

If Supabase is not configured, uploads run in `local-fallback` mode.

## Production deploy topology

- `Next.js app` -> Vercel
- `parser-service` -> Railway/Render
- `Postgres/Auth/Storage/Vector` -> Supabase

## Testing

```bash
npm test
cd parser-service && python3 -m unittest test_parser.py
```

## Seed RAG examples

```bash
node scripts/seed-clause-examples.mjs
```
