# ClauseIQ MVP Progress Log

This file summarizes what has been implemented since the start of this chat.

## 1) Project scaffolding and baseline app

- Created a new Next.js + TypeScript project in `clauseiq`.
- Set up core config files:
  - `package.json` scripts (`dev`, `build`, `start`, `lint`)
  - `tsconfig.json`, `next.config.ts`, `next-env.d.ts`
  - `.eslintrc.json`, `postcss.config.js`
- Added base global styling in `src/app/globals.css`.
- Added app shell in `src/app/layout.tsx`.

## 2) MVP Upload + Change Risk Register UI

- Built the main page in `src/app/page.tsx` with:
  - Two file inputs (base lease + redline)
  - Property context fields:
    - property type
    - province
    - GLA
    - base rent
    - lease term
    - operating cost
- Added sortable/filterable Change Risk Register table with columns from the brief:
  - clause type, summary, favours, impact low/high, confidence, method, recommendation, notes.
- Added inline notes editing.
- Added summary bar with totals and risk signal.
- Added mandatory legal disclaimer text.

## 3) Quantification engine starter logic

- Added shared types in `src/lib/types.ts`.
- Added starter quantification logic in `src/lib/quantification.ts`:
  - Deterministic CAM cap NPV range
  - Deterministic free-rent PV
  - Initial actuarial / benchmarked / qualitative placeholders
- Added parser-driven change mapping (`buildChangesFromParser`) to classify extracted text into initial clause buckets and produce register rows.

## 4) API routes

- Added `POST /api/analyze` in `src/app/api/analyze/route.ts` (initial JSON-based stub analysis).
- Added `POST /api/upload` in `src/app/api/upload/route.ts`:
  - Accepts multipart form data
  - Handles file inputs and property context
  - Runs parser extraction (when configured)
  - Builds risk register output
  - Persists files + analysis data when Supabase is configured
  - Falls back safely if parser/Supabase is unavailable

## 5) Supabase integration

- Installed `@supabase/supabase-js`.
- Added server client helper in `src/lib/supabase-server.ts`.
- Added persistence layer in `src/lib/persistence.ts`:
  - File upload to bucket `leases`
  - Insert analysis records into `analyses`
  - Insert change rows into `changes`
- Added local fallback mode when Supabase env vars are missing.
- Added environment template in `.env.example`.

## 6) Database schema

- Added `supabase/schema.sql` with:
  - Required enum types
  - `analyses` table
  - `changes` table
  - `clause_examples` table with `vector(1536)` for RAG embeddings
  - Supporting index on `changes.analysis_id`

## 7) Python parser microservice

- Added parser service in `parser-service`:
  - `main.py`
  - `requirements.txt`
  - `README.md`
- Implemented endpoints:
  - `GET /health`
  - `POST /extract/docx-tracked`
  - `POST /extract/pdf-text`
- Upgraded DOCX extraction to parse tracked changes directly from DOCX XML:
  - reads `word/document.xml`
  - extracts `w:ins` and `w:del` content
  - returns structured `changes_detected`

## 8) Parser integration in app flow

- Wired `POST /api/upload` to call parser service via `PARSER_SERVICE_URL`.
- Uses redline DOCX tracked extraction first.
- If no tracked changes are returned, attempts fallback extraction from base DOCX.
- Uses parser output to drive risk register item generation.
- Falls back to stub changes when parser output is unavailable.

## 9) Documentation

- Added root `README.md` with:
  - setup
  - run steps
  - Supabase setup
  - parser service startup

## 10) Validation performed during implementation

- Repeatedly ran production build (`npm run build`) after major edits; final build passes.
- Checked lints on modified TypeScript files; no linter errors reported.
- Verified parser Python syntax compile (`py_compile`) with local cache path.

## Current status

- The MVP foundation is live and runnable with:
  - upload UI,
  - risk register UI,
  - API routes,
  - quantification starter logic,
  - Supabase persistence hooks,
  - parser microservice with real DOCX tracked-change extraction.
- Remaining major items for full brief coverage:
  - robust PDF-vs-PDF and clean DOCX-vs-DOCX semantic diff pipeline
  - RAG clause classification (embeddings + retrieval + LLM)
  - auth/history screens
  - PDF report generation flow
