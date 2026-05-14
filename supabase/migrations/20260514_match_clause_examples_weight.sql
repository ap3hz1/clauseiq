-- Rank retrieval by raw cosine similarity scaled by corpus confidence_weight (PRD §7.4 / §9).
-- Returned `similarity` remains the unweighted cosine match for tier thresholds (PRD §7.2).

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
    ranked.id,
    ranked.clause_type,
    ranked.clause_text,
    ranked.favours,
    ranked.similarity
  from (
    select
      ce.id,
      ce.clause_type,
      ce.clause_text,
      ce.favours,
      (1 - (ce.embedding <=> query_embedding))::float as similarity,
      ((1 - (ce.embedding <=> query_embedding)) * ce.confidence_weight)::float as weighted_score
    from clause_examples ce
  ) ranked
  order by ranked.weighted_score desc
  limit match_count;
$$;
