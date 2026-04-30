create extension if not exists "pgcrypto";
create extension if not exists "vector";

create type property_type as enum ('industrial', 'office', 'retail', 'mixed_use');
create type province_code as enum ('ON', 'BC', 'AB');
create type analysis_status as enum ('processing', 'complete', 'error');
create type risk_signal as enum ('manageable', 'material', 'significant');
create type favours_side as enum ('landlord', 'tenant', 'neutral');
create type confidence_level as enum ('high', 'medium', 'low');
create type quant_method as enum ('deterministic', 'actuarial', 'benchmarked', 'qualitative');
create type recommendation_type as enum ('accept', 'counter', 'reject');

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  property_type property_type not null,
  province province_code not null default 'ON',
  gla_sqft integer not null,
  base_rent_psf numeric(12,2) not null,
  lease_term_years numeric(8,2) not null,
  operating_cost_psf numeric(12,2),
  base_lease_file text not null,
  redline_file text not null,
  status analysis_status not null default 'processing',
  total_changes integer not null default 0,
  total_impact_low numeric(14,2) not null default 0,
  total_impact_high numeric(14,2) not null default 0,
  signal risk_signal not null default 'manageable',
  parser_path text,
  parser_confidence confidence_level not null default 'low',
  analysis_version text not null default '2026.04-prod'
);

create table if not exists changes (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  clause_type text not null,
  change_summary text not null,
  favours favours_side not null,
  impact_low numeric(14,2),
  impact_high numeric(14,2),
  confidence confidence_level not null,
  method quant_method not null,
  recommendation recommendation_type not null,
  original_text text,
  redlined_text text,
  user_notes text,
  dismissed boolean not null default false
);

create table if not exists clause_examples (
  id uuid primary key default gen_random_uuid(),
  clause_type text not null,
  clause_text text not null,
  embedding vector(1536) not null,
  favours favours_side not null,
  property_type property_type,
  source text not null,
  confidence_weight numeric(3,2) not null default 1.0
);

create index if not exists idx_changes_analysis_id on changes (analysis_id);
create index if not exists idx_clause_examples_embedding on clause_examples using ivfflat (embedding vector_cosine_ops);

create table if not exists pilot_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function match_clause_examples(query_embedding vector(1536), match_count int default 5)
returns table (
  id uuid,
  clause_type text,
  favours favours_side,
  similarity float
)
language sql
as $$
  select
    ce.id,
    ce.clause_type,
    ce.favours,
    (1 - (ce.embedding <=> query_embedding))::float as similarity
  from clause_examples ce
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;

alter table analyses enable row level security;
alter table changes enable row level security;
alter table pilot_metrics enable row level security;

create policy analyses_owner_policy on analyses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy changes_owner_policy on changes
for all
using (
  exists (
    select 1 from analyses a
    where a.id = changes.analysis_id and a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from analyses a
    where a.id = changes.analysis_id and a.user_id = auth.uid()
  )
);

create policy pilot_metrics_owner_policy on pilot_metrics
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
