import type { AnalysisInput, Confidence, Favours } from "@/lib/types";
import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { inferClauseTypeFromText } from "@/lib/clauseKeywords";
import { MVP_CLAUSE_TYPES, normalizeClauseType, OUT_OF_SCOPE_TOPICS } from "@/lib/engine/quantification";

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
  before_text?: string;
  after_text?: string;
}

interface RetrievedExample {
  id?: string;
  clause_type: string;
  clause_text?: string | null;
  favours: Favours;
  similarity: number;
}

const FULL_TAXONOMY = [
  "Quantified MVP types (PRD §5):",
  ...MVP_CLAUSE_TYPES.map((t) => `  - ${t}`),
  "Out-of-scope topics (route to qualitative review, do NOT pick a quantified type):",
  ...OUT_OF_SCOPE_TOPICS.map((t) => `  - ${t}`)
].join("\n");

/**
 * Builds the ±2 paragraphs of surrounding context PRD §7.2 requires.
 * Parser rows already carry `before_text` and `after_text` when available;
 * we trim each side to 600 chars to stay under the model context budget.
 */
function buildClauseContext(change: ParsedChange): string {
  const before = (change.before_text ?? "").trim();
  const after = (change.after_text ?? "").trim();
  const parts: string[] = [];
  if (before) parts.push(`[BEFORE PARAGRAPHS]\n${before.slice(-1200)}`);
  parts.push(`[CHANGED PARAGRAPH — base]\n${(change.deleted_text ?? "").slice(0, 1500)}`);
  parts.push(`[CHANGED PARAGRAPH — redline]\n${(change.inserted_text ?? "").slice(0, 1500)}`);
  if (after) parts.push(`[AFTER PARAGRAPHS]\n${after.slice(0, 1200)}`);
  return parts.join("\n\n");
}

function summariseRetrieved(retrieved: RetrievedExample[]): string {
  return retrieved
    .map(
      (r, i) =>
        `Example ${i + 1} (similarity ${r.similarity.toFixed(2)}, label=${r.clause_type}, favours=${r.favours}):\n${(r.clause_text ?? "").slice(0, 800)}`
    )
    .join("\n\n---\n\n");
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

/** Collapse whitespace; downstream persists up to `PERSIST_SUMMARY_MAX` chars (see changePipeline). */
function normalizeSummaryText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Matches changePipeline `classified.summary.trim().slice(0, 4000)` — truncate here only as last resort. */
const PERSIST_SUMMARY_MAX = 4000;

function truncateSummaryAtWord(text: string, maxLen: number): string {
  const t = normalizeSummaryText(text);
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const head = (lastSpace > Math.floor(maxLen * 0.55) ? slice.slice(0, lastSpace) : slice).trimEnd();
  return `${head}…`;
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
    summary: truncateSummaryAtWord(text, PERSIST_SUMMARY_MAX),
    favours,
    confidence: clauseType === "Unclassified Change" ? "low" : "medium",
    similarity: clauseType === "Unclassified Change" ? 0.55 : 0.75
  };
}

async function retrieveSimilar(embedding: number[]): Promise<RetrievedExample[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  /** RPC orders by similarity × confidence_weight; returned `similarity` is still raw cosine match for tiering (PRD §7.2 / §7.4). */
  const { data } = await client.rpc("match_clause_examples", {
    query_embedding: embedding,
    match_count: 5
  });
  return (data ?? []) as RetrievedExample[];
}

async function classifyWithAnthropic(
  clauseContext: string,
  propertyContext: string,
  retrieved: RetrievedExample[]
) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const userContent = [
    "You are a commercial lease expert classifying a single redline change.",
    "",
    "Pick exactly one label from the taxonomy below. If the change matches an OUT-OF-SCOPE topic, return that topic literally and the system will route it to qualitative review.",
    "",
    "## Taxonomy",
    FULL_TAXONOMY,
    "",
    "## Property facts",
    propertyContext,
    "",
    "## Surrounding ±2 paragraphs (context window)",
    clauseContext,
    "",
    "## Top retrieved examples from the annotated corpus",
    retrieved.length ? summariseRetrieved(retrieved) : "(no examples)",
    "",
    "## Output",
    "Return ONLY JSON with keys: clauseType (string, MUST be one of the taxonomy labels above), ",
    "summary (string, neutral plain English: complete sentences describing what changed and why it matters; ",
    `stay concise but finish properly — aim under ${Math.floor(PERSIST_SUMMARY_MAX * 0.85)} characters and never exceed ${PERSIST_SUMMARY_MAX}; `,
    "end with terminal punctuation), ",
    "favours (landlord|tenant|neutral). No prose, no Markdown, no code fences."
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 4096,
      messages: [{ role: "user", content: userContent }]
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
    summary: normalizeSummaryText(parsed.summary),
    favours: normalizeFavours(parsed.favours, "neutral")
  };
}

export async function classifyChanges(
  changes: ParsedChange[],
  input: AnalysisInput,
  opts?: { onProgress?: (current: number, total: number) => void }
): Promise<ClassifiedChange[]> {
  const propertyContext = `Property type: ${input.propertyType}\nProvince: ${input.province}\nGLA: ${input.glaSqft} sqft\nBase rent: $${input.baseRentPsf}/sqft/yr\nLease term: ${input.leaseTermYears} years`;
  const out: ClassifiedChange[] = [];
  const total = changes.length;
  for (let idx = 0; idx < changes.length; idx++) {
    const change = changes[idx];
    opts?.onProgress?.(idx + 1, total);
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
    const clauseContext = buildClauseContext(change);
    const ai = await classifyWithAnthropic(clauseContext, propertyContext, retrieved);
    if (!ai) {
      out.push({ ...fallback, confidence: retrievalConfidence });
      continue;
    }
    const normalized = normalizeClauseType(ai.clauseType);
    out.push({
      clauseType: normalized,
      summary: truncateSummaryAtWord(ai.summary, PERSIST_SUMMARY_MAX),
      favours: ai.favours,
      confidence: retrievalConfidence,
      similarity: score
    });
  }
  return out;
}
