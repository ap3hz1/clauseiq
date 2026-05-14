"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AnalysisResult, AnalysisInput, ChangeItem, Confidence, QuantMethod, Recommendation } from "@/lib/types";
import { classifyRiskSignal } from "@/lib/riskSignal";

const INITIAL_INPUT: AnalysisInput = {
  propertyType: "office",
  province: "ON",
  glaSqft: 18000,
  baseRentPsf: 34,
  leaseTermYears: 5
};

type Filter = "all" | "tenant" | "landlord" | "neutral";
type SortKey = "clauseType" | "impactLow" | "impactHigh";
type ConfidenceFilter = "all" | Confidence;
type MethodFilter = "all" | QuantMethod;
type RecommendationFilter = "all" | Recommendation;

function money(value: number | null): string {
  if (value === null) return "Qualitative";
  return value.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function exposureRange(low: number | null | undefined, high: number | null | undefined): string {
  const l = typeof low === "number" ? money(low) : "Qualitative";
  const h = typeof high === "number" ? money(high) : "Qualitative";
  return `${l} – ${h}`;
}

async function readUploadNdjsonStream(
  response: Response,
  onProgress: (message: string) => void
): Promise<AnalysisResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj.kind === "progress" && typeof obj.message === "string") {
        onProgress(obj.message);
      } else if (obj.kind === "complete" && obj.data) {
        return obj.data as AnalysisResult;
      } else if (obj.kind === "error") {
        const msg = typeof obj.message === "string" ? obj.message : "Analysis failed";
        throw new Error(msg);
      }
    }
    if (done) break;
  }
  throw new Error("Analysis ended without a result — please retry.");
}

export default function HomePage() {
  const [input, setInput] = useState<AnalysisInput>(INITIAL_INPUT);
  const [opCostInput, setOpCostInput] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [baseLeaseFile, setBaseLeaseFile] = useState<File | null>(null);
  const [redlineLeaseFile, setRedlineLeaseFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const baselineImpactsRef = useRef<Map<string, { low: number | null; high: number | null }>>(new Map());
  const lastAnalysisIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [favoursFilter, setFavoursFilter] = useState<Filter>("all");
  const [clauseTypeFilter, setClauseTypeFilter] = useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [recFilter, setRecFilter] = useState<RecommendationFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("impactHigh");
  const reportLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!analysis) return;
    if (lastAnalysisIdRef.current !== analysis.id) {
      lastAnalysisIdRef.current = analysis.id;
      baselineImpactsRef.current = new Map(
        analysis.changes.map((c) => [c.id, { low: c.impactLow, high: c.impactHigh }])
      );
    }
  }, [analysis]);

  const registerTotals = useMemo(() => {
    if (!analysis) return null;
    const active = analysis.changes.filter((c) => !c.dismissed);
    const low = active.reduce((s, c) => s + (c.impactLow ?? 0), 0);
    const high = active.reduce((s, c) => s + (c.impactHigh ?? 0), 0);
    return {
      totalChanges: active.length,
      low,
      high,
      signal: classifyRiskSignal(high)
    };
  }, [analysis]);

  const favoursCounts = useMemo(() => {
    if (!analysis) return { tenant: 0, landlord: 0, neutral: 0 };
    return analysis.changes
      .filter((row) => !row.dismissed)
      .reduce(
        (acc, row) => {
          acc[row.favours] += 1;
          return acc;
        },
        { tenant: 0, landlord: 0, neutral: 0 }
      );
  }, [analysis]);

  const totalChangesIdentified = useMemo(() => analysis?.changes.length ?? 0, [analysis]);

  const clauseTypeOptions = useMemo(() => {
    if (!analysis) return [] as string[];
    const set = new Set(analysis.changes.map((c) => c.clauseType));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [analysis]);

  const displayedChanges = useMemo(() => {
    if (!analysis) return [];
    let rows = analysis.changes;
    if (favoursFilter !== "all") rows = rows.filter((r) => r.favours === favoursFilter);
    if (clauseTypeFilter !== "all") rows = rows.filter((r) => r.clauseType === clauseTypeFilter);
    if (confidenceFilter !== "all") rows = rows.filter((r) => r.confidence === confidenceFilter);
    if (methodFilter !== "all") rows = rows.filter((r) => r.method === methodFilter);
    if (recFilter !== "all") rows = rows.filter((r) => r.recommendation === recFilter);
    return [...rows].sort((a, b) => {
      if (sortKey === "clauseType") return a.clauseType.localeCompare(b.clauseType);
      return (b[sortKey] ?? -1) - (a[sortKey] ?? -1);
    });
  }, [analysis, favoursFilter, clauseTypeFilter, confidenceFilter, methodFilter, recFilter, sortKey]);

  async function runAnalysis() {
    if (!baseLeaseFile || !redlineLeaseFile) return;
    setIsLoading(true);
    setAnalysisError(null);
    setProgressLabel("Starting…");
    try {
      const payload = new FormData();
      payload.set("baseLease", baseLeaseFile);
      payload.set("redlineLease", redlineLeaseFile);
      payload.set("propertyType", input.propertyType);
      payload.set("province", input.province);
      payload.set("glaSqft", String(input.glaSqft));
      payload.set("baseRentPsf", String(input.baseRentPsf));
      payload.set("leaseTermYears", String(input.leaseTermYears));
      payload.set("operatingCostPsf", opCostInput.trim());
      payload.set("discountRate", discountInput.trim());
      if (input.propertyAddress) payload.set("propertyAddress", input.propertyAddress);
      if (input.landlordParty) payload.set("landlordParty", input.landlordParty);
      if (input.tenantParty) payload.set("tenantParty", input.tenantParty);
      if (input.analystName) payload.set("analystName", input.analystName);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "X-ClauseIQ-Progress-Stream": "1" },
        body: payload
      });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(errBody?.error?.message ?? "Analysis failed");
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      const data = contentType.includes("application/x-ndjson")
        ? await readUploadNdjsonStream(response, setProgressLabel)
        : ((await response.json()) as { data: AnalysisResult }).data;

      setAnalysis(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setAnalysisError(msg);
    } finally {
      setIsLoading(false);
      setProgressLabel(null);
    }
  }

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    await runAnalysis();
  }

  function setNote(id: string, text: string) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        changes: prev.changes.map((c) => (c.id === id ? { ...c, userNotes: text } : c))
      };
    });
  }

  function resetAnnotations() {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const base = baselineImpactsRef.current;
      return {
        ...prev,
        changes: prev.changes.map((c) => {
          const b = base.get(c.id);
          return {
            ...c,
            userNotes: undefined,
            dismissed: false,
            impactLow: b ? b.low : c.impactLow,
            impactHigh: b ? b.high : c.impactHigh
          };
        })
      };
    });
  }

  function setDismissed(id: string, dismissed: boolean) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        changes: prev.changes.map((c) => (c.id === id ? { ...c, dismissed } : c))
      };
    });
  }

  function setImpacts(id: string, impactLow: number | null, impactHigh: number | null) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        changes: prev.changes.map((c) => (c.id === id ? { ...c, impactLow, impactHigh } : c))
      };
    });
  }

  function exportPdf() {
    if (!analysis) return;
    const changesPayload = analysis.changes.map((c) => ({
      id: c.id,
      userNotes: c.userNotes ?? null,
      dismissed: Boolean(c.dismissed),
      impactLow: c.impactLow,
      impactHigh: c.impactHigh
    }));
    void fetch(`/api/analyses/${analysis.id}/changes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: changesPayload })
    })
      .catch(() => null)
      .then(() => {
        if (reportLinkRef.current) {
          reportLinkRef.current.click();
        } else {
          window.open(`/api/reports/${analysis.id}`, "_blank");
        }
      });
  }

  function updateField<K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  const opCostHint = opCostInput.trim().length === 0
    ? "Leave blank to use a property-type system estimate (shown after analysis)."
    : null;

  return (
    <main className="container">
      <div className="topbar">
        <div>
          <h1 className="title">ClauseIQ</h1>
          <p className="subtitle">Commercial Lease Risk Quantification</p>
        </div>
        <div className="topbar-actions actions-stack">
          <Link className="nav-link" href="/history">
            Analysis history
          </Link>
          <Link className="nav-link" href="/pilot">
            Pilot metrics
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"))}
          >
            Log out
          </button>
        </div>
      </div>

      <form className="card" onSubmit={handleAnalyze}>
        <div className="card-heading">
          <h2 className="card-title">Lease inputs</h2>
          <p className="card-lead">Upload the base lease and redline, confirm economics, then run the analysis.</p>
        </div>
        <div className="grid grid-2">
        <label>
          Base lease file
          <input
            type="file"
            accept=".docx,.pdf"
            onChange={(e) => setBaseLeaseFile(e.target.files?.[0] ?? null)}
            required
          />
          {baseLeaseFile ? <small>{baseLeaseFile.name}</small> : null}
        </label>

        <label>
          Redlined turn file
          <input
            type="file"
            accept=".docx,.pdf"
            onChange={(e) => setRedlineLeaseFile(e.target.files?.[0] ?? null)}
            required
          />
          {redlineLeaseFile ? <small>{redlineLeaseFile.name}</small> : null}
        </label>

        <label>
          Property type
          <select value={input.propertyType} onChange={(e) => updateField("propertyType", e.target.value as AnalysisInput["propertyType"])}>
            <option value="industrial">Industrial</option>
            <option value="office">Office</option>
            <option value="retail">Retail</option>
            <option value="mixed_use">Mixed-Use</option>
          </select>
        </label>

        <label>
          Province
          <select value={input.province} onChange={(e) => updateField("province", e.target.value as AnalysisInput["province"])}>
            <option value="ON">ON</option>
            <option value="BC">BC</option>
            <option value="AB">AB</option>
          </select>
        </label>

        <label>
          Property address (optional)
          <input
            type="text"
            value={input.propertyAddress ?? ""}
            placeholder="e.g. 100 King St W, Toronto, ON"
            onChange={(e) => updateField("propertyAddress", e.target.value)}
          />
        </label>

        <label>
          Analyst name (optional)
          <input
            type="text"
            value={input.analystName ?? ""}
            placeholder="Your name"
            onChange={(e) => updateField("analystName", e.target.value)}
          />
        </label>

        <label>
          Landlord party (optional)
          <input
            type="text"
            value={input.landlordParty ?? ""}
            onChange={(e) => updateField("landlordParty", e.target.value)}
          />
        </label>

        <label>
          Tenant party (optional)
          <input
            type="text"
            value={input.tenantParty ?? ""}
            onChange={(e) => updateField("tenantParty", e.target.value)}
          />
        </label>

        <label>
          Gross leasable area (sqft)
          <input type="number" min={1} value={input.glaSqft} onChange={(e) => updateField("glaSqft", Number(e.target.value))} required />
        </label>

        <label>
          Base rent ($/sqft/year)
          <input type="number" min={1} value={input.baseRentPsf} onChange={(e) => updateField("baseRentPsf", Number(e.target.value))} required />
        </label>

        <label>
          Lease term (years)
          <input type="number" min={1} value={input.leaseTermYears} onChange={(e) => updateField("leaseTermYears", Number(e.target.value))} required />
        </label>

        <label>
          Operating costs ($/sqft/year, optional)
          <input
            type="number"
            min={0}
            step="0.01"
            value={opCostInput}
            placeholder="Blank uses system estimate"
            onChange={(e) => setOpCostInput(e.target.value)}
          />
          {opCostHint ? <span className="field-hint estimate-active">{opCostHint}</span> : null}
        </label>

        <label>
          Discount rate (decimal, optional)
          <input
            type="number"
            min={0}
            max={0.25}
            step="0.005"
            value={discountInput}
            placeholder="Blank uses default 0.06 (PRD §6.1)"
            onChange={(e) => setDiscountInput(e.target.value)}
          />
          <span className="field-hint">Used for NPV/PV across all clause formulas.</span>
        </label>

        <div className="form-submit-row">
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? "Working…" : "Run analysis"}
          </button>
          {analysisError ? (
            <p className="analysis-error" role="alert">
              {analysisError}{" "}
              {/session is invalid|not authenticated/i.test(analysisError) ? (
                <Link href="/login">Sign in again</Link>
              ) : null}
            </p>
          ) : null}
          {isLoading && progressLabel ? (
            <p className="analysis-progress" role="status" aria-live="polite" aria-busy="true">
              {progressLabel}
            </p>
          ) : null}
        </div>
        </div>
      </form>

      {analysis ? (
        <>
          <section className="card">
            <div className="card-heading">
              <h2 className="card-title">Change Risk Register</h2>
              <p className="card-lead">Filter and annotate rows; dismissed items are excluded from totals and PDF.</p>
            </div>
            <div className="summary-grid summary-grid-prd">
              <div className="summary-tile">
                <div className="summary-label">Total changes identified</div>
                <div className="summary-value">{totalChangesIdentified}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Changes favouring tenant</div>
                <div className="summary-value">{favoursCounts.tenant}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Total estimated landlord exposure (low–high)</div>
                <div className="summary-value exposure-range">
                  {exposureRange(registerTotals?.low ?? analysis.totalImpactLow, registerTotals?.high ?? analysis.totalImpactHigh)}
                </div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Overall risk signal</div>
                <div className={`summary-value signal ${registerTotals?.signal ?? analysis.signal}`}>
                  {titleCase(registerTotals?.signal ?? analysis.signal)}
                </div>
              </div>
            </div>
            <div className="summary-grid summary-grid-secondary sm:grid-cols-2 lg:grid-cols-2">
              {analysis.operatingCostPsfUsed != null ? (
                <div className="summary-tile border-dashed border-slate-200 bg-white/80">
                  <div className="summary-label">
                    {analysis.operatingCostPsfEstimated ? "Operating cost (system estimate)" : "Operating cost (entered)"}
                  </div>
                  <div className="summary-value">{`$${analysis.operatingCostPsfUsed.toFixed(2)}/sqft/yr`}</div>
                </div>
              ) : null}
              <div className="summary-tile border-dashed border-slate-200 bg-white/80">
                <div className="summary-label">Discount rate (used)</div>
                <div className="summary-value">{`${((analysis.discountRateUsed ?? 0.06) * 100).toFixed(1)}%`}</div>
              </div>
            </div>

            <div className="filter-panel">
            <div className="filter-group">
              <span className="filter-label">Favours</span>
              <div className="filter-chips">
                <Chip active={favoursFilter === "all"} onClick={() => setFavoursFilter("all")}>All</Chip>
                <Chip active={favoursFilter === "tenant"} onClick={() => setFavoursFilter("tenant")}>Tenant</Chip>
                <Chip active={favoursFilter === "landlord"} onClick={() => setFavoursFilter("landlord")}>Landlord</Chip>
                <Chip active={favoursFilter === "neutral"} onClick={() => setFavoursFilter("neutral")}>Neutral</Chip>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Confidence</span>
              <div className="filter-chips">
                <Chip active={confidenceFilter === "all"} onClick={() => setConfidenceFilter("all")}>All</Chip>
                <Chip active={confidenceFilter === "high"} onClick={() => setConfidenceFilter("high")}>High</Chip>
                <Chip active={confidenceFilter === "medium"} onClick={() => setConfidenceFilter("medium")}>Medium</Chip>
                <Chip active={confidenceFilter === "low"} onClick={() => setConfidenceFilter("low")}>Low</Chip>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Method</span>
              <div className="filter-chips">
                <Chip active={methodFilter === "all"} onClick={() => setMethodFilter("all")}>All</Chip>
                <Chip active={methodFilter === "deterministic"} onClick={() => setMethodFilter("deterministic")}>Deterministic</Chip>
                <Chip active={methodFilter === "actuarial"} onClick={() => setMethodFilter("actuarial")}>Actuarial</Chip>
                <Chip active={methodFilter === "benchmarked"} onClick={() => setMethodFilter("benchmarked")}>Benchmarked</Chip>
                <Chip active={methodFilter === "qualitative"} onClick={() => setMethodFilter("qualitative")}>Qualitative</Chip>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Recommendation</span>
              <div className="filter-chips">
                <Chip active={recFilter === "all"} onClick={() => setRecFilter("all")}>All</Chip>
                <Chip active={recFilter === "accept"} onClick={() => setRecFilter("accept")}>Accept</Chip>
                <Chip active={recFilter === "counter"} onClick={() => setRecFilter("counter")}>Counter</Chip>
                <Chip active={recFilter === "reject"} onClick={() => setRecFilter("reject")}>Reject</Chip>
              </div>
            </div>

            <div className="grid grid-2 border-t border-slate-100 pt-4 mt-2">
              <label>
                Filter clause type
                <select value={clauseTypeFilter} onChange={(e) => setClauseTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {clauseTypeOptions.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort by
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="impactHigh">Impact (High)</option>
                  <option value="impactLow">Impact (Low)</option>
                  <option value="clauseType">Clause Type</option>
                </select>
              </label>
            </div>
            </div>

            <div className="register-actions">
              <button type="button" className="btn-primary" onClick={exportPdf}>
                Export PDF
              </button>
              <a
                ref={reportLinkRef}
                href={`/api/reports/${analysis.id}`}
                target="_blank"
                rel="noopener"
                style={{ display: "none" }}
              >
                Download report
              </a>
              <button type="button" className="btn-secondary" onClick={resetAnnotations}>
                Reset annotations
              </button>
              <button type="button" className="btn-secondary" onClick={runAnalysis} disabled={isLoading}>
                {isLoading ? "Re-running…" : "Re-run analysis"}
              </button>
            </div>
            {analysisError ? (
              <p className="analysis-error mt-3" role="alert">
                {analysisError}{" "}
                {/session is invalid|not authenticated/i.test(analysisError) ? (
                  <Link href="/login">Sign in again</Link>
                ) : null}
              </p>
            ) : null}
            {isLoading && progressLabel ? (
              <p className="analysis-progress mt-3" role="status" aria-live="polite" aria-busy="true">
                {progressLabel}
              </p>
            ) : null}
          </section>

          <section className="card">
            <div className="card-heading mb-3 border-0 pb-0">
              <h2 className="card-title">Detailed register</h2>
              <p className="card-lead">Per-change impacts, confidence, and reviewer notes.</p>
            </div>
            <div className="risk-register-scroll">
              <table className="risk-register-table">
              <thead>
                <tr>
                  <th>Clause Type</th>
                  <th>Change Summary</th>
                  <th>Favours</th>
                  <th>Impact (Low)</th>
                  <th>Impact (High)</th>
                  <th>Confidence</th>
                  <th>Method</th>
                  <th>Recommendation</th>
                  <th>Dismiss</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {displayedChanges.map((row) => (
                  <RiskRow
                    key={row.id}
                    row={row}
                    onNoteChange={setNote}
                    onDismissChange={setDismissed}
                    onImpactsChange={setImpacts}
                  />
                ))}
              </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: import("react").ReactNode }) {
  return (
    <button type="button" className={`filter-chip${active ? " active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function RiskRow({
  row,
  onNoteChange,
  onDismissChange,
  onImpactsChange
}: {
  row: ChangeItem;
  onNoteChange: (id: string, note: string) => void;
  onDismissChange: (id: string, dismissed: boolean) => void;
  onImpactsChange: (id: string, low: number | null, high: number | null) => void;
}) {
  const hasExcerpts = (row.originalText && row.originalText.trim().length > 0) || (row.redlinedText && row.redlinedText.trim().length > 0);
  const lowStr = row.impactLow == null ? "" : String(row.impactLow);
  const highStr = row.impactHigh == null ? "" : String(row.impactHigh);
  return (
    <tr style={row.dismissed ? { opacity: 0.45 } : undefined}>
      <td>{row.clauseType}</td>
      <td className="change-summary-cell">
        {row.changeSummary}
        {hasExcerpts ? (
          <details className="excerpt-toggle mt-2">
            <summary>View base / redline excerpts</summary>
            <div className="excerpt-panel">
              <div>
                <span className="excerpt-label">Base lease (struck text)</span>
                <pre className="excerpt-pre">{row.originalText || "—"}</pre>
              </div>
              <div>
                <span className="excerpt-label">Redline (inserted text)</span>
                <pre className="excerpt-pre">{row.redlinedText || "—"}</pre>
              </div>
            </div>
          </details>
        ) : null}
      </td>
      <td>
        <span className={`pill ${row.favours}`}>{row.favours}</span>
      </td>
      <td>
        <input
          type="number"
          className="impact-input"
          aria-label={`Impact low for ${row.clauseType}`}
          value={lowStr}
          placeholder="—"
          onChange={(e) => {
            const t = e.target.value.trim();
            const low = t === "" ? null : Number(t);
            const nextLow = t === "" || Number.isFinite(low) ? (t === "" ? null : low!) : row.impactLow;
            onImpactsChange(row.id, nextLow, row.impactHigh);
          }}
        />
      </td>
      <td>
        <input
          type="number"
          className="impact-input"
          aria-label={`Impact high for ${row.clauseType}`}
          value={highStr}
          placeholder="—"
          onChange={(e) => {
            const t = e.target.value.trim();
            const high = t === "" ? null : Number(t);
            const nextHigh = t === "" || Number.isFinite(high) ? (t === "" ? null : high!) : row.impactHigh;
            onImpactsChange(row.id, row.impactLow, nextHigh);
          }}
        />
      </td>
      <td>
        <span className={`badge confidence-${row.confidence}`}>{row.confidence}</span>
      </td>
      <td>
        <span className={`badge method-${row.method}`}>{row.method}</span>
      </td>
      <td>
        <span className={`badge rec-${row.recommendation}`}>{row.recommendation}</span>
      </td>
      <td>
        <label className="dismiss-cell">
          <input type="checkbox" checked={Boolean(row.dismissed)} onChange={(e) => onDismissChange(row.id, e.target.checked)} />
          <span>Dismiss</span>
        </label>
      </td>
      <td>
        <textarea
          rows={2}
          value={row.userNotes ?? ""}
          onChange={(e) => onNoteChange(row.id, e.target.value)}
          placeholder="Add review notes..."
        />
      </td>
    </tr>
  );
}
