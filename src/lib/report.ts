import { ApiError } from "@/lib/http";

interface ReportChange {
  clause_type: string;
  change_summary: string;
  impact_low: number | null;
  impact_high: number | null;
  confidence: string;
  method: string;
  recommendation: string;
  user_notes: string | null;
}

export interface ReportInput {
  property: string | null | undefined;
  analyst: string;
  createdAt: string;
  totalLow: number | null;
  totalHigh: number | null;
  signal: string | null | undefined;
  changes: ReportChange[];
}

function escapeHtml(text: string | null | undefined): string {
  const s = text ?? "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCad(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "Qualitative";
  return value.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

function methodologySection(): string {
  return `
    <h2>Methodology notes</h2>
    <ul>
      <li><strong>Deterministic</strong> — formulas from lease economics you entered; discount rate applied where relevant.</li>
      <li><strong>Actuarial</strong> — expected value using probability and benchmark assumptions.</li>
      <li><strong>Benchmarked</strong> — market-practice ranges; wider uncertainty.</li>
      <li><strong>Qualitative</strong> — not dollar-quantified in this MVP; human review recommended.</li>
    </ul>
  `;
}

export function buildReportHtml(input: ReportInput): string {
  const topRisks = [...input.changes]
    .map((c) => ({ ...c, _high: Number(c.impact_high) || 0 }))
    .sort((a, b) => b._high - a._high)
    .slice(0, 3);

  const rowsHtml = input.changes
    .map(
      (c, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(c.clause_type)}</td>
      <td class="summary-col">${escapeHtml(c.change_summary)}</td>
      <td>${escapeHtml(c.confidence)}</td>
      <td>${escapeHtml(c.method)}</td>
      <td>${escapeHtml(c.recommendation)}</td>
      <td class="money">${formatCad(c.impact_low)}</td>
      <td class="money">${formatCad(c.impact_high)}</td>
      <td class="notes-col">${escapeHtml(c.user_notes ?? "—")}</td>
    </tr>`
    )
    .join("");

  const topHtml = topRisks
    .map(
      (c, i) => {
        const summary = c.change_summary ?? "";
        const excerpt = summary.slice(0, 200);
        const ell = summary.length > 200 ? "…" : "";
        return `
    <li><strong>${i + 1}.</strong> ${escapeHtml(c.clause_type)} — ${escapeHtml(excerpt)}${ell}
      <span class="muted">(${formatCad(c.impact_low)} – ${formatCad(c.impact_high)})</span></li>`;
      }
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ClauseIQ — Change Risk Register</title>
  <style>
    @page { size: letter; margin: 0.55in; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 11px;
      line-height: 1.45;
      color: #0f172a;
      margin: 0;
    }
    h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.02em; }
    h2 { font-size: 13px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .muted { color: #64748b; font-weight: 500; }
    .cover-meta { margin: 0; padding: 0; list-style: none; }
    .cover-meta li { margin: 4px 0; }
    .exec-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin: 12px 0; }
    .exec-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
    .exec-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
    .exec-label { font-size: 9px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    .exec-value { font-size: 14px; font-weight: 700; margin-top: 2px; }
    .signal { font-weight: 700; text-transform: capitalize; }
    .signal.manageable { color: #059669; }
    .signal.material { color: #d97706; }
    .signal.significant { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; margin-top: 8px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 5px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
    tr:nth-child(even) td { background: #fafafa; }
    .summary-col { max-width: 220px; word-wrap: break-word; }
    .notes-col { max-width: 140px; word-wrap: break-word; }
    .money { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { margin: 4px 0; }
    .disclaimer { margin-top: 20px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 10px; color: #92400e; }
  </style>
</head>
<body>
  <h1>ClauseIQ — Change Risk Register</h1>
  <p class="muted">Commercial lease risk quantification</p>

  <h2>Cover</h2>
  <ul class="cover-meta">
    <li><strong>Property type:</strong> ${escapeHtml(input.property)}</li>
    <li><strong>Analyst (user id):</strong> ${escapeHtml(input.analyst)}</li>
    <li><strong>Analysis date:</strong> ${escapeHtml(input.createdAt)}</li>
  </ul>

  <h2>Executive summary</h2>
  <div class="exec-box">
    <div class="exec-grid">
      <div class="exec-tile">
        <div class="exec-label">Total exposure (low)</div>
        <div class="exec-value">${formatCad(input.totalLow)}</div>
      </div>
      <div class="exec-tile">
        <div class="exec-label">Total exposure (high)</div>
        <div class="exec-value">${formatCad(input.totalHigh)}</div>
      </div>
      <div class="exec-tile">
        <div class="exec-label">Overall signal</div>
        <div class="exec-value signal ${escapeHtml(input.signal)}">${escapeHtml(input.signal)}</div>
      </div>
    </div>
    <p style="margin:12px 0 4px;font-weight:600;">Top risk items</p>
    <ol style="margin:0;padding-left:18px;">${topHtml}</ol>
  </div>

  <h2>Change risk register</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Clause type</th>
        <th>Change summary</th>
        <th>Confidence</th>
        <th>Method</th>
        <th>Recommendation</th>
        <th>Impact (low)</th>
        <th>Impact (high)</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  ${methodologySection()}

  <div class="disclaimer">
    <strong>Disclaimer.</strong> ClauseIQ provides decision-support estimates, not legal or financial advice. Always seek qualified legal counsel before making decisions based on this analysis.
  </div>
</body>
</html>`;
}

export async function renderReportPdf(html: string): Promise<Buffer> {
  let browser: import("puppeteer").Browser | undefined;
  try {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
      displayHeaderFooter: false
    });
    return Buffer.from(pdf);
  } catch (cause) {
    const hint =
      cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : "unknown error";
    throw new ApiError(
      503,
      "pdf_render_failed",
      `PDF rendering failed (${hint}). Ensure Chromium can launch locally (first run may download a browser).`
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
