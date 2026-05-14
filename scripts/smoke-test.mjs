import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const ORIGIN = "http://localhost:3000";
const EMAIL = `smoke${Date.now()}@example.com`;
const PASSWORD = "Smoke12345!";

const envText = fs.readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq), l.slice(eq + 1)];
    })
);

async function main() {
  console.log(`[smoke] admin-create user ${EMAIL}`);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true
  });
  if (created.error) {
    console.error("[smoke] admin createUser failed:", created.error);
    process.exit(1);
  }
  console.log("[smoke] user id:", created.data.user?.id);

  console.log("[smoke] logging in to obtain session cookie");
  const loginResp = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const loginBody = await loginResp.json();
  console.log(`[smoke] login status=${loginResp.status}`, loginBody);
  if (!loginResp.ok) process.exit(1);
  const cookie = loginResp.headers.get("set-cookie");
  if (!cookie) {
    console.error("[smoke] no session cookie obtained");
    process.exit(1);
  }
  const cookieHeader = cookie.split(";")[0];
  console.log(`[smoke] cookie=${cookieHeader.slice(0, 40)}...`);

  const baseFile = path.resolve("demo-docs/base-lease.docx");
  const redlineFile = path.resolve("demo-docs/redline-lease.docx");
  const baseBuf = fs.readFileSync(baseFile);
  const redlineBuf = fs.readFileSync(redlineFile);

  const fd = new FormData();
  fd.set(
    "baseLease",
    new Blob([baseBuf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    "base-lease.docx"
  );
  fd.set(
    "redlineLease",
    new Blob([redlineBuf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    "redline-lease.docx"
  );
  fd.set("propertyType", "office");
  fd.set("province", "ON");
  fd.set("glaSqft", "18000");
  fd.set("baseRentPsf", "34");
  fd.set("leaseTermYears", "5");
  fd.set("operatingCostPsf", "14");

  console.log("[smoke] uploading lease pair");
  const uploadResp = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: cookieHeader, Origin: ORIGIN },
    body: fd
  });
  const uploadBody = await uploadResp.json();
  console.log(`[smoke] upload status=${uploadResp.status}`);
  if (!uploadResp.ok) {
    console.error("[smoke] upload failed", uploadBody);
    process.exit(1);
  }
  const data = uploadBody.data;
  console.log("[smoke] analysis id:", data.id);
  console.log("[smoke] parserPath:", data.parserPath, "confidence:", data.parserConfidence);
  console.log("[smoke] storageMode:", data.storageMode);
  console.log("[smoke] totalChanges:", data.totalChanges);
  console.log("[smoke] signal:", data.signal);
  console.log("[smoke] impact low/high:", data.totalImpactLow, "/", data.totalImpactHigh);
  console.log("[smoke] first 3 changes:");
  for (const c of (data.changes || []).slice(0, 3)) {
    console.log(`  - ${c.clauseType} | favours=${c.favours} | summary=${(c.changeSummary || "").slice(0, 80)}`);
  }
  console.log("[smoke] DONE");
}

main().catch((e) => {
  console.error("[smoke] error:", e);
  process.exit(1);
});
