import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!url || !key || !openAiKey) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY");
}

const examples = [
  { clause_type: "CAM / Operating Cost Cap", clause_text: "Operating costs are capped at 3% per annum.", favours: "tenant", source: "seed", confidence_weight: 1 },
  { clause_type: "Free Rent / Rent Abatement", clause_text: "Tenant receives four months free rent.", favours: "tenant", source: "seed", confidence_weight: 1 },
  { clause_type: "Personal Guarantee Scope", clause_text: "Guarantee limited to first six months of term.", favours: "tenant", source: "seed", confidence_weight: 1 }
];

async function embed(input) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAiKey}`
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input })
  });
  const json = await res.json();
  return json.data?.[0]?.embedding;
}

async function run() {
  const supabase = createClient(url, key);
  for (const item of examples) {
    const embedding = await embed(item.clause_text);
    await supabase.from("clause_examples").insert({
      ...item,
      embedding,
      property_type: null
    });
  }
  console.log(`Seeded ${examples.length} clause examples`);
}

run();
