# ClauseIQ MVP

MVP scaffold for commercial lease risk quantification.

## Included

- Next.js app with **Tailwind CSS** + upload form + Change Risk Register UI
- `POST /api/upload` multipart endpoint
- Supabase storage + DB persistence hooks
- Deterministic quantification starter formulas (CAM cap, free rent)
- Python parser microservice skeleton in `parser-service`
- Auth API + session cookie workflow
- Analysis history + **Puppeteer** PDF export (HTML → print-quality PDF)
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
npm run puppeteer:install
npm run dev
```

`npm run puppeteer:install` downloads the Chrome build Puppeteer uses for PDF export (one-time, ~hundreds of MB). Skip only if you will not use `/api/reports/[id]`.

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

## PDF reports (Puppeteer)

- `/api/reports/[id]` renders an HTML report and prints it with **Puppeteer** (Chromium).
- **Required once per machine:** `npm run puppeteer:install` (or `npx puppeteer browsers install chrome`). Without this you will see “Could not find Chrome” and PDFs return `503` with `pdf_render_failed`. The browser is cached under `~/.cache/puppeteer` by default.
- First launch after install can still take a few seconds while the binary starts.
- **Vercel serverless:** full Puppeteer + bundled Chromium often hits size/runtime limits. For production on Vercel, consider a dedicated PDF worker (e.g. separate Node service, container, or `@sparticuz/chromium` + `puppeteer-core`). Local and long-running Node hosts work with the default setup.


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
