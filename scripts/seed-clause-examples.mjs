import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!url || !key || !openAiKey) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY");
}

const corpusPath = path.resolve(process.cwd(), "scripts", "clause-examples-corpus.json");
if (!existsSync(corpusPath)) {
  throw new Error(`Corpus file not found at ${corpusPath}. Add JSON examples first.`);
}

const examples = JSON.parse(readFileSync(corpusPath, "utf8"));

function isValidExample(e) {
  return (
    typeof e?.clause_type === "string" &&
    typeof e?.clause_text === "string" &&
    e.clause_text.length >= 40 &&
    typeof e?.favours === "string" &&
    typeof e?.source === "string"
  );
}

async function embed(input) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAiKey}`
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input })
  });
  if (!res.ok) {
    throw new Error(`Embedding failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.data?.[0]?.embedding;
}

async function run() {
  const filtered = examples.filter(isValidExample);
  if (filtered.length !== examples.length) {
    console.warn(`Skipping ${examples.length - filtered.length} malformed examples.`);
  }
  if (filtered.length < 14) {
    console.warn(`Only ${filtered.length} examples; PRD §7.4 targets ≥200, ≥10 per of 14 MVP types.`);
  }
  const supabase = createClient(url, key);
  let inserted = 0;
  for (const item of filtered) {
    const embedding = await embed(item.clause_text);
    const { error } = await supabase.from("clause_examples").insert({
      clause_type: item.clause_type,
      clause_text: item.clause_text,
      favours: item.favours,
      property_type: item.property_type ?? null,
      source: item.source,
      confidence_weight: item.confidence_weight ?? 1.0,
      embedding
    });
    if (error) {
      console.error(`Insert failed for "${item.clause_type}": ${error.message}`);
      continue;
    }
    inserted += 1;
  }
  console.log(`Seeded ${inserted} clause examples (of ${filtered.length} attempted).`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
