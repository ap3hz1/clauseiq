import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getAnalysisWithChanges } from "@/lib/persistence";
import AnalysisDetailClient, { type DetailChange } from "./AnalysisDetailClient";

type DbChange = {
  id: string;
  clause_type: string;
  change_summary: string;
  favours: string;
  impact_low: number | null;
  impact_high: number | null;
  confidence: string;
  method: string;
  recommendation: string;
  user_notes: string | null;
  dismissed: boolean | null;
  original_text: string | null;
  redlined_text: string | null;
};

function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return (
      <main className="container">
        <section className="card max-w-lg">
          <h1 className="title">Analysis</h1>
          <p className="subtitle">You need to log in first.</p>
          <Link className="nav-link mt-4 inline-flex" href="/login">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  const { id } = await params;
  const bundle = await getAnalysisWithChanges(userId, id);
  if (!bundle) return notFound();

  const analysis = bundle.analysis as Record<string, unknown>;
  const rawChanges = (bundle.changes ?? []) as DbChange[];
  const changes: DetailChange[] = rawChanges.map((c) => ({
    id: c.id,
    clauseType: c.clause_type,
    changeSummary: c.change_summary,
    favours: c.favours,
    impactLow: c.impact_low == null ? null : Number(c.impact_low),
    impactHigh: c.impact_high == null ? null : Number(c.impact_high),
    confidence: c.confidence,
    method: c.method,
    recommendation: c.recommendation,
    userNotes: c.user_notes ?? "",
    dismissed: Boolean(c.dismissed),
    originalText: c.original_text ?? "",
    redlinedText: c.redlined_text ?? ""
  }));

  return (
    <main className="container">
      <section className="card">
        <div className="topbar">
          <div>
            <h1 className="title">Re-open analysis</h1>
            <p className="subtitle">
              {(analysis.property_address as string | null) ?? "—"} · {titleCase(analysis.property_type as string)} ·{" "}
              {new Date(analysis.created_at as string).toLocaleString()}
            </p>
          </div>
          <div className="topbar-actions actions-stack">
            <Link className="nav-link" href="/history">
              History
            </Link>
          </div>
        </div>

        <ul className="cover-meta">
          {analysis.landlord_party ? (
            <li>
              <strong>Landlord:</strong> {String(analysis.landlord_party)}
            </li>
          ) : null}
          {analysis.tenant_party ? (
            <li>
              <strong>Tenant:</strong> {String(analysis.tenant_party)}
            </li>
          ) : null}
          {analysis.analyst_name ? (
            <li>
              <strong>Analyst:</strong> {String(analysis.analyst_name)}
            </li>
          ) : null}
          <li>
            <strong>Total exposure:</strong>{" "}
            {Number(analysis.total_impact_low).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })} –{" "}
            {Number(analysis.total_impact_high).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
          </li>
          <li>
            <strong>Risk signal:</strong> {titleCase(analysis.signal as string)}
          </li>
        </ul>
      </section>

      <AnalysisDetailClient analysisId={id} initialChanges={changes} />
    </main>
  );
}
