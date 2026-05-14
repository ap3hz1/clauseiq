import type { AnalysisInput, Confidence, Favours } from "@/lib/types";
import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { inferClauseTypeFromText } from "@/lib/clauseKeywords";
import { normalizeClauseType } from "@/lib/engine/quantification";

export interface ClassifiedChange {
  clauseType: string;
  summary: string;
  favours: Favours;
  confidence: Confidence;
  similarity: number;
}

interface ParsedChange {
  change_type: string;
  inserted_text: string;
  deleted_text: string;
}

function parseAssistantJson(raw: string): { clauseType: string; summary: string; favours?: string } | null {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```/im.exec(s);
  if (fence) s = fence[1].trim();
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (typeof o.clauseType !== "string" || typeof o.summary !== "string") return null;
    return {
      clauseType: o.clauseType,
      summary: o.summary,
      favours: typeof o.favours === "string" ? o.favours : undefined
    };
  } catch {
    return null;
  }
}

function normalizeFavours(f: string | undefined, fallback: Favours): Favours {
  if (f === "landlord" || f === "tenant" || f === "neutral") return f;
  return fallback;
}

async function embedText(text: string): Promise<number[] | null> {
  if (!env.OPENAI_API_KEY) return null;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text
    })
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? null;
}

function confidenceFromSimilarity(score: number): Confidence {
  if (score > 0.85) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

function fallbackClassifier(text: string): ClassifiedChange {
  const clauseType = inferClauseTypeFromText(text, "");
  const favours: Favours = text.toLowerCase().includes("landlord")
    ? "landlord"
    : text.toLowerCase().includes("tenant")
      ? "tenant"
      : "neutral";
  return {
    clauseType,
    summary: text.slice(0, 180),
    favours,
    confidence: clauseType === "Unclassified Change" ? "low" : "medium",
    similarity: clauseType === "Unclassified Change" ? 0.55 : 0.75
  };
}

async function retrieveSimilar(embedding: number[]) {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data } = await client.rpc("match_clause_examples", {
    query_embedding: embedding,
    match_count: 5
  });
  return (data ?? []) as Array<{ clause_type: string; favours: Favours; similarity: number }>;
}

async function classifyWithAnthropic(text: string, context: string, retrieved: Array<{ clause_type: string; favours: Favours; similarity: number }>) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const prompt = {
    text,
    context,
    taxonomy: "ClauseIQ MVP taxonomy",
    retrieved
  };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Classify this lease change to one taxonomy clause type. Return JSON only with keys clauseType, summary, favours (landlord|tenant|neutral).\n${JSON.stringify(prompt)}`
        }
      ]
    })
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { content?: Array<{ text?: string }> };
  const textOut = body.content?.[0]?.text;
  if (!textOut) return null;
  const parsed = parseAssistantJson(textOut);
  if (!parsed) return null;
  return {
    clauseType: parsed.clauseType,
    summary: parsed.summary,
    favours: normalizeFavours(parsed.favours, "neutral")
  };
}

export async function classifyChanges(changes: ParsedChange[], input: AnalysisInput): Promise<ClassifiedChange[]> {
  const context = `${input.propertyType} ${input.province} ${input.glaSqft} sqft`;
  const out: ClassifiedChange[] = [];
  for (const change of changes) {
    const text = `${change.inserted_text} ${change.deleted_text}`.trim();
    const fallback = fallbackClassifier(text);
    const embedding = await embedText(text);
    if (!embedding) {
      out.push(fallback);
      continue;
    }
    const retrieved = await retrieveSimilar(embedding);
    const top = retrieved[0];
    const score = top?.similarity ?? fallback.similarity;
    const retrievalConfidence = confidenceFromSimilarity(score);
    const ai = await classifyWithAnthropic(text, context, retrieved);
    if (!ai) {
      out.push({ ...fallback, confidence: retrievalConfidence });
      continue;
    }
    const normalized = normalizeClauseType(ai.clauseType);
    out.push({
      clauseType: normalized,
      summary: ai.summary,
      favours: ai.favours,
      confidence: retrievalConfidence,
      similarity: score
    });
  }
  return out;
}
