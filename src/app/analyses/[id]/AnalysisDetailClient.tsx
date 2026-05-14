"use client";

import { useRef, useState } from "react";

export interface DetailChange {
  id: string;
  clauseType: string;
  changeSummary: string;
  favours: string;
  impactLow: number | null;
  impactHigh: number | null;
  confidence: string;
  method: string;
  recommendation: string;
  userNotes: string;
  dismissed: boolean;
  originalText: string;
  redlinedText: string;
}

export default function AnalysisDetailClient({
  analysisId,
  initialChanges
}: {
  analysisId: string;
  initialChanges: DetailChange[];
}) {
  const [changes, setChanges] = useState<DetailChange[]>(initialChanges);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const reportLinkRef = useRef<HTMLAnchorElement>(null);

  function updateNote(id: string, text: string) {
    setChanges((rows) => rows.map((r) => (r.id === id ? { ...r, userNotes: text } : r)));
  }

  function toggleDismiss(id: string) {
    setChanges((rows) => rows.map((r) => (r.id === id ? { ...r, dismissed: !r.dismissed } : r)));
  }

  function updateImpact(id: string, impactLow: number | null, impactHigh: number | null) {
    setChanges((rows) => rows.map((r) => (r.id === id ? { ...r, impactLow, impactHigh } : r)));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        changes: changes.map((c) => ({
          id: c.id,
          userNotes: c.userNotes,
          dismissed: c.dismissed,
          impactLow: c.impactLow,
          impactHigh: c.impactHigh
        }))
      };
      const response = await fetch(`/api/analyses/${analysisId}/changes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const wrapped = (await response.json()) as { data: { updated: number } };
        setStatus(`Saved ${wrapped.data.updated} change(s).`);
      } else {
        setStatus("Save failed.");
      }
    } finally {
      setSaving(false);
    }
  }

  function exportPdf() {
    const payload = {
      changes: changes.map((c) => ({
        id: c.id,
        userNotes: c.userNotes ?? null,
        dismissed: Boolean(c.dismissed),
        impactLow: c.impactLow,
        impactHigh: c.impactHigh
      }))
    };
    void fetch(`/api/analyses/${analysisId}/changes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .catch(() => null)
      .then(() => {
        reportLinkRef.current?.click();
      });
  }

  return (
    <>
      <section className="card">
        <div className="card-heading mb-4 border-0 pb-0">
          <h2 className="card-title">Change register</h2>
          <p className="card-lead">Adjust impacts, notes, and dismissal; save or export PDF.</p>
        </div>
        <div className="register-actions border-0 pt-0">
          <button type="button" className="btn-primary" onClick={exportPdf}>
            Export PDF
          </button>
          <a
            ref={reportLinkRef}
            href={`/api/reports/${analysisId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "none" }}
          >
            Download report
          </a>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save annotations"}
          </button>
          {status ? <span className="text-sm font-medium text-slate-600">{status}</span> : null}
        </div>
        <div className="risk-register-scroll mt-4">
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
              {changes.map((r) => (
                <DetailRow
                  key={r.id}
                  row={r}
                  onNoteChange={updateNote}
                  onDismissToggle={toggleDismiss}
                  onImpactChange={updateImpact}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DetailRow({
  row,
  onNoteChange,
  onDismissToggle,
  onImpactChange
}: {
  row: DetailChange;
  onNoteChange: (id: string, text: string) => void;
  onDismissToggle: (id: string) => void;
  onImpactChange: (id: string, low: number | null, high: number | null) => void;
}) {
  const lowStr = row.impactLow == null ? "" : String(row.impactLow);
  const highStr = row.impactHigh == null ? "" : String(row.impactHigh);
  return (
    <tr style={row.dismissed ? { opacity: 0.45 } : undefined}>
      <td>{row.clauseType}</td>
      <td className="change-summary-cell">
        {row.changeSummary}
        {row.originalText || row.redlinedText ? (
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
            onImpactChange(row.id, nextLow, row.impactHigh);
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
            onImpactChange(row.id, row.impactLow, nextHigh);
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
        <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => onDismissToggle(row.id)}>
          {row.dismissed ? "Restore" : "Dismiss"}
        </button>
      </td>
      <td>
        <textarea
          rows={2}
          value={row.userNotes}
          onChange={(e) => onNoteChange(row.id, e.target.value)}
          placeholder="Add review notes..."
        />
      </td>
    </tr>
  );
}
