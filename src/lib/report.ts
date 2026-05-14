import { ApiError } from "@/lib/http";
import { CLAUSEIQ_LEGAL_DISCLAIMER_BODY } from "@/lib/legalDisclaimer";

interface ReportChange {
  clause_type: string;
  change_summary: string;
  favours?: string | null;
  impact_low: number | null;
  impact_high: number | null;
  confidence: string;
  method: string;
  recommendation: string;
  user_notes: string | null;
  dismissed?: boolean | null;
}

export interface ReportInput {
  property: string | null | undefined;
  /** Display-friendly property type (Title Case). */
  propertyType?: string | null;
  propertyAddress?: string | null;
  landlordParty?: string | null;
  tenantParty?: string | null;
  analystName?: string | null;
  /** Fallback shown if analystName is not provided (e.g. user UUID). */
  analyst: string;
  createdAt: string;
  totalLow: number | null;
  totalHigh: number | null;
  signal: string | null | undefined;
  discountRate?: number | null;
  operatingCostPsfUsed?: number | null;
  operatingCostPsfEstimated?: boolean;
  /** Document extraction path from parser (PRD §7.1 transparency). */
  parserPath?: string | null;
  parserConfidence?: string | null;
  changes: ReportChange[];
}

function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Top-3 ranking that places qualitative items LAST (treat null impact as Number.NEGATIVE_INFINITY for sorting). */
function rankTopRisks(changes: ReportChange[]): ReportChange[] {
  return [...changes]
    .sort((a, b) => {
      const aH = typeof a.impact_high === "number" && !Number.isNaN(a.impact_high) ? a.impact_high : Number.NEGATIVE_INFINITY;
      const bH = typeof b.impact_high === "number" && !Number.isNaN(b.impact_high) ? b.impact_high : Number.NEGATIVE_INFINITY;
      return bH - aH;
    })
    .slice(0, 3);
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
    <h3 style="font-size:11px;margin:14px 0 6px;text-transform:none;letter-spacing:0;color:#334155;">Quantification fidelity (MVP)</h3>
    <ul>
      <li><strong>CAM / operating costs</strong> — Growth bands and caps in the engine are illustrative defaults (e.g. generic growth scenarios and a fixed cap placeholder). They do not yet parse negotiated cumulative vs non-cumulative CAM caps or lease-specific growth percentages from clause text; override dollar estimates in the register when your lease wording differs materially.</li>
      <li><strong>Renewal / option rent</strong> — Renewal scenarios use the economics you supplied and standard range bands; explicit sensitivity tables (e.g. market rent assumption swings) are not broken out as separate lines in this PDF. Note material assumptions in row-level notes where needed.</li>
    </ul>
  `;
}

/** PDF-safe block layout: Chromium often clips overflowing &lt;table&gt; cells even with wrap CSS. */
export function buildReportHtml(input: ReportInput): string {
  const activeChanges = input.changes.filter((c) => !c.dismissed);
  const topRisks = rankTopRisks(activeChanges);

  const registerCardsHtml = activeChanges
    .map((c, idx) => {
      const summary = escapeHtml(c.change_summary ?? "");
      const notes = escapeHtml(c.user_notes ?? "—");
      return `
    <article class="register-card">
      <header class="register-card-head">
        <span class="register-idx">${idx + 1}</span>
        <h3 class="register-clause">${escapeHtml(c.clause_type)}</h3>
      </header>
      <div class="register-block register-summary-wrap">
        <div class="register-k">Change summary</div>
        <p class="register-prose">${summary}</p>
      </div>
      <div class="register-meta-grid">
        <div>
          <div class="register-k">Favours</div>
          <div>${escapeHtml(titleCase(c.favours ?? "—"))}</div>
        </div>
        <div>
          <div class="register-k">Confidence</div>
          <div>${escapeHtml(titleCase(c.confidence))}</div>
        </div>
        <div>
          <div class="register-k">Method</div>
          <div>${escapeHtml(titleCase(c.method))}</div>
        </div>
        <div>
          <div class="register-k">Recommendation</div>
          <div>${escapeHtml(titleCase(c.recommendation))}</div>
        </div>
        <div>
          <div class="register-k">Impact (low)</div>
          <div class="register-money">${formatCad(c.impact_low)}</div>
        </div>
        <div>
          <div class="register-k">Impact (high)</div>
          <div class="register-money">${formatCad(c.impact_high)}</div>
        </div>
      </div>
      <div class="register-block register-notes">
        <div class="register-k">Notes</div>
        <p class="register-prose">${notes}</p>
      </div>
    </article>`;
    })
    .join("");

  const topHtml = topRisks
    .map((c) => {
      const summary = c.change_summary ?? "";
      return `
    <li class="top-risk-li">
      <div><strong>${escapeHtml(c.clause_type)}</strong>
        <span class="muted"> (${formatCad(c.impact_low)} – ${formatCad(c.impact_high)})</span></div>
      <p class="top-risk-prose">${escapeHtml(summary)}</p>
    </li>`;
    })
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
    /* Full-width cards — avoids Chromium PDF clipping multi-column table cells. */
    .register-list { margin-top: 10px; }
    .register-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px 12px;
      margin-bottom: 11px;
      background: #fafafa;
      display: flow-root;
      overflow: visible;
    }
    .register-card:nth-child(odd) { background: #fff; }
    .register-card-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .register-idx {
      flex: 0 0 auto;
      font-weight: 800;
      font-size: 12px;
      color: #475569;
    }
    .register-clause {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
    }
    .register-k {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .register-block { margin-bottom: 10px; }
    .register-notes { margin-bottom: 0; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }
    .register-prose,
    .top-risk-prose {
      margin: 0;
      font-size: 10px;
      line-height: 1.55;
      white-space: normal;
      overflow-wrap: anywhere;
      word-wrap: break-word;
      word-break: break-word;
      hyphens: auto;
      max-width: 100%;
      overflow: visible;
    }
    .register-meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px 14px;
      font-size: 9px;
    }
    .register-money { font-variant-numeric: tabular-nums; font-weight: 600; }
    .top-risk-li { margin: 10px 0; }
    .top-risk-prose { margin-top: 5px; padding-left: 14px; border-left: 2px solid #e2e8f0; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { margin: 4px 0; }
    .disclaimer { margin-top: 20px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 10px; color: #92400e; }

    /*
      Chromium PDF: keeping entire cards unbreakable clips long summaries at page boundaries.
      Allow cards (and prose) to span pages so full change summaries render.
    */
    @media print {
      .register-card {
        break-inside: auto;
        page-break-inside: auto;
        -webkit-column-break-inside: auto;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      .register-card-head {
        break-after: avoid;
        page-break-after: avoid;
      }
      .register-meta-grid {
        break-inside: auto;
        page-break-inside: auto;
      }
      .register-notes {
        break-before: auto;
        page-break-before: auto;
      }
      .register-prose {
        orphans: 3;
        widows: 3;
      }
      .top-risk-li {
        break-inside: auto;
        page-break-inside: auto;
      }
      .top-risk-prose {
        orphans: 3;
        widows: 3;
      }
    }
  </style>
</head>
<body>
  <h1>ClauseIQ — Change Risk Register</h1>
  <p class="muted">Commercial lease risk quantification</p>

  <h2>Cover</h2>
  <ul class="cover-meta">
    ${input.propertyAddress ? `<li><strong>Property address:</strong> ${escapeHtml(input.propertyAddress)}</li>` : ""}
    <li><strong>Property type:</strong> ${escapeHtml(titleCase(input.propertyType ?? input.property))}</li>
    ${input.landlordParty ? `<li><strong>Landlord:</strong> ${escapeHtml(input.landlordParty)}</li>` : ""}
    ${input.tenantParty ? `<li><strong>Tenant:</strong> ${escapeHtml(input.tenantParty)}</li>` : ""}
    <li><strong>Analyst:</strong> ${escapeHtml(input.analystName || input.analyst)}</li>
    <li><strong>Analysis date:</strong> ${escapeHtml(input.createdAt)}</li>
    ${input.parserPath ? `<li><strong>Extraction path:</strong> ${escapeHtml(input.parserPath)}</li>` : ""}
    ${input.parserConfidence ? `<li><strong>Parser confidence:</strong> ${escapeHtml(titleCase(input.parserConfidence))}</li>` : ""}
    ${typeof input.discountRate === "number" ? `<li><strong>Discount rate:</strong> ${(input.discountRate * 100).toFixed(1)}%</li>` : ""}
    ${input.operatingCostPsfEstimated && typeof input.operatingCostPsfUsed === "number" ? `<li><strong>Operating cost (system estimate):</strong> $${input.operatingCostPsfUsed.toFixed(2)}/sqft/yr</li>` : ""}
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
        <div class="exec-value signal ${escapeHtml(input.signal)}">${escapeHtml(titleCase(input.signal))}</div>
      </div>
    </div>
    <p style="margin:12px 0 4px;font-weight:600;">Top risk items</p>
    <ol style="margin:0;padding-left:18px;">${topHtml}</ol>
  </div>

  <h2>Change risk register</h2>
  <p class="muted" style="margin:4px 0 2px;font-size:10px;">Each row below is one detected change. Summaries use full stored text (within database limits); register layout uses full width for readability.</p>
  <div class="register-list">${registerCardsHtml}</div>

  ${methodologySection()}

  <div class="disclaimer">
    <strong>Disclaimer.</strong> ${escapeHtml(CLAUSEIQ_LEGAL_DISCLAIMER_BODY)}
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
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMediaType("print");
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
