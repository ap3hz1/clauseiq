"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AnalysisResult, AnalysisInput, ChangeItem } from "@/lib/types";

const INITIAL_INPUT: AnalysisInput = {
  propertyType: "office",
  province: "ON",
  glaSqft: 18000,
  baseRentPsf: 34,
  leaseTermYears: 5,
  operatingCostPsf: 14
};

type Filter = "all" | "tenant" | "landlord" | "neutral";
type SortKey = "clauseType" | "impactLow" | "impactHigh";

function money(value: number | null): string {
  if (value === null) return "Qualitative";
  return value.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

export default function HomePage() {
  const [input, setInput] = useState<AnalysisInput>(INITIAL_INPUT);
  const [baseLeaseFile, setBaseLeaseFile] = useState<File | null>(null);
  const [redlineLeaseFile, setRedlineLeaseFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [favoursFilter, setFavoursFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("impactHigh");
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  const displayedChanges = useMemo(() => {
    if (!analysis) return [];
    let rows = analysis.changes;
    if (favoursFilter !== "all") {
      rows = rows.filter((row) => row.favours === favoursFilter);
    }
    return [...rows].sort((a, b) => {
      if (sortKey === "clauseType") return a.clauseType.localeCompare(b.clauseType);
      return (b[sortKey] ?? -1) - (a[sortKey] ?? -1);
    });
  }, [analysis, favoursFilter, sortKey]);

  useEffect(() => {
    void fetch("/api/auth/me").then((r) => setIsAuthed(r.ok));
  }, []);

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!baseLeaseFile || !redlineLeaseFile) return;
    setIsLoading(true);
    try {
      const payload = new FormData();
      payload.set("baseLease", baseLeaseFile);
      payload.set("redlineLease", redlineLeaseFile);
      payload.set("propertyType", input.propertyType);
      payload.set("province", input.province);
      payload.set("glaSqft", String(input.glaSqft));
      payload.set("baseRentPsf", String(input.baseRentPsf));
      payload.set("leaseTermYears", String(input.leaseTermYears));
      payload.set("operatingCostPsf", String(input.operatingCostPsf ?? ""));

      const response = await fetch("/api/upload", {
        method: "POST",
        body: payload
      });
      if (!response.ok) throw new Error("Analysis failed");
      const wrapped = (await response.json()) as { data: AnalysisResult };
      const data = wrapped.data;
      setAnalysis(data);
      void fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "analysis_completed",
          payload: { totalChanges: data.totalChanges, signal: data.signal }
        })
      });
    } finally {
      setIsLoading(false);
    }
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

  function updateField<K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="container">
      <div className="topbar">
        <div>
          <h1 className="title">ClauseIQ</h1>
          <p className="subtitle">Commercial Lease Risk Quantification</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/history">Analysis history</Link>
          <Link href="/pilot">Pilot metrics</Link>
          {isAuthed ? (
            <button onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => location.reload())}>Logout</button>
          ) : (
            <Link href="/login">Login</Link>
          )}
        </div>
      </div>

      <form className="card grid grid-2" onSubmit={handleAnalyze}>
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
          Operating costs ($/sqft/year)
          <input type="number" min={0} value={input.operatingCostPsf} onChange={(e) => updateField("operatingCostPsf", Number(e.target.value))} />
        </label>

        <div>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Running analysis..." : "Run Analysis"}
          </button>
        </div>
      </form>

      {analysis ? (
        <>
          <section className="card">
            <strong style={{ fontSize: 18 }}>Change Risk Register</strong>
            <div className="summary-grid">
              <div className="summary-tile">
                <div className="summary-label">Total changes</div>
                <div className="summary-value">{analysis.totalChanges}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Exposure (Low)</div>
                <div className="summary-value">{money(analysis.totalImpactLow)}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Exposure (High)</div>
                <div className="summary-value">{money(analysis.totalImpactHigh)}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Risk signal</div>
                <div className={`summary-value signal ${analysis.signal}`}>{analysis.signal}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Storage mode</div>
                <div className="summary-value">{analysis.storageMode}</div>
              </div>
            </div>
            <div className="grid grid-2">
              <label>
                Filter favours
                <select value={favoursFilter} onChange={(e) => setFavoursFilter(e.target.value as Filter)}>
                  <option value="all">All</option>
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                  <option value="neutral">Neutral</option>
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
          </section>

          <section className="card">
            <table>
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
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {displayedChanges.map((row) => (
                  <RiskRow key={row.id} row={row} onNoteChange={setNote} />
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <p>
              ClauseIQ provides decision-support estimates, not legal or financial advice. Always seek qualified legal counsel before making
              decisions based on this analysis.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}

function RiskRow({ row, onNoteChange }: { row: ChangeItem; onNoteChange: (id: string, note: string) => void }) {
  return (
    <tr>
      <td>{row.clauseType}</td>
      <td>{row.changeSummary}</td>
      <td>
        <span className={`pill ${row.favours}`}>{row.favours}</span>
      </td>
      <td>{money(row.impactLow)}</td>
      <td>{money(row.impactHigh)}</td>
      <td>{row.confidence}</td>
      <td>{row.method}</td>
      <td>{row.recommendation}</td>
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
