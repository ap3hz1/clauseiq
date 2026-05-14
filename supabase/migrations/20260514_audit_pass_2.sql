-- Audit Pass 2 — schema additions for PDF cover, history, configurable engine,
-- and RAG corpus hardening.
-- Idempotent: safe to apply to existing DB.

alter table analyses
  add column if not exists operating_cost_psf_estimated boolean not null default false,
  add column if not exists discount_rate numeric(6,4),
  add column if not exists property_address text,
  add column if not exists landlord_party text,
  add column if not exists tenant_party text,
  add column if not exists analyst_name text,
  add column if not exists base_lease_filename text,
  add column if not exists redline_filename text;

-- match_clause_examples now returns clause_text so the classifier prompt can
-- include retrieved example bodies (PRD §7.2).
-- PG cannot CREATE OR REPLACE when OUT-parameter row type changes; drop first.
drop function if exists match_clause_examples(vector(1536), integer);

create function match_clause_examples(query_embedding vector(1536), match_count int default 5)
returns table (
  id uuid,
  clause_type text,
  clause_text text,
  favours favours_side,
  similarity float
)
language sql
as $$
  select
    ce.id,
    ce.clause_type,
    ce.clause_text,
    ce.favours,
    (1 - (ce.embedding <=> query_embedding))::float as similarity
  from clause_examples ce
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;

-- clause_examples.source becomes enum; confidence_weight constrained to 1.0 / 0.7 (PRD §7.4).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'clause_example_source') then
    create type clause_example_source as enum ('edgar', 'canlii', 'orea', 'synthetic', 'human');
  end if;
end $$;

alter table clause_examples
  alter column source drop default,
  alter column source type clause_example_source
    using (case
      when source in ('edgar','canlii','orea','synthetic','human') then source::clause_example_source
      else 'human'::clause_example_source
    end),
  alter column source set default 'human'::clause_example_source;

alter table clause_examples
  drop constraint if exists clause_examples_confidence_weight_check;

alter table clause_examples
  add constraint clause_examples_confidence_weight_check
    check (confidence_weight in (1.0, 0.7));
