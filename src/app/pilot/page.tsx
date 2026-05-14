import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { listMetrics } from "@/lib/persistence";

type Payload = Record<string, unknown>;

function payloadAnalysisId(p: unknown): string | undefined {
  if (!p || typeof p !== "object") return undefined;
  const id = (p as Payload).analysis_id;
  return typeof id === "string" ? id : undefined;
}

function payloadDurationMs(p: unknown): number | undefined {
  if (!p || typeof p !== "object") return undefined;
  const n = (p as Payload).duration_ms;
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return undefined;
}

export default async function PilotPage() {
  let metrics: Awaited<ReturnType<typeof listMetrics>> = [];
  try {
    const userId = await requireUserId();
    metrics = await listMetrics(userId);
  } catch {
    return (
      <main className="container">
        <section className="card max-w-lg">
          <h1 className="title">Pilot metrics</h1>
          <p className="subtitle">Login required.</p>
          <Link className="nav-link mt-4 inline-flex" href="/login">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  const completed = metrics.filter((m) => m.event_type === "analysis_completed");
  const downloads = metrics.filter((m) => m.event_type === "report_downloaded");

  const durations = completed.map((m) => payloadDurationMs(m.payload)).filter((n): n is number => n !== undefined);
  const avgMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const completedIds = new Set(
    completed.map((m) => payloadAnalysisId(m.payload)).filter((id): id is string => Boolean(id))
  );
  const downloadedIds = new Set(
    downloads.map((m) => payloadAnalysisId(m.payload)).filter((id): id is string => Boolean(id))
  );
  let analysesWithDownload = 0;
  for (const id of completedIds) {
    if (downloadedIds.has(id)) analysesWithDownload += 1;
  }
  const downloadCoveragePct =
    completedIds.size > 0 ? Math.min(100, Math.round((analysesWithDownload / completedIds.size) * 100)) : null;

  const byType = metrics.reduce<Record<string, number>>((acc, item) => {
    acc[item.event_type] = (acc[item.event_type] ?? 0) + 1;
    return acc;
  }, {});

  const formatDuration = (ms: number | null) => {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  return (
    <main className="container">
      <section className="card">
        <div className="topbar mb-4">
          <div>
            <h1 className="title">Pilot metrics</h1>
            <p className="subtitle">Usage signals for your account ({metrics.length} recorded events).</p>
          </div>
          <div className="topbar-actions actions-stack">
            <Link className="nav-link" href="/">
              Analyzer
            </Link>
          </div>
        </div>

        <div className="summary-grid summary-grid-prd mb-6">
          <div className="summary-tile">
            <div className="summary-label">Analyses completed</div>
            <div className="summary-value">{completed.length}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Reports downloaded</div>
            <div className="summary-value">{downloads.length}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Avg. completion time</div>
            <div className="summary-value">{formatDuration(avgMs)}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Distinct analyses with ≥1 PDF download</div>
            <div className="summary-value">
              {completedIds.size > 0 ? `${downloadCoveragePct}% (${analysesWithDownload}/${completedIds.size})` : "—"}
            </div>
          </div>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          Completion times and download coverage use payloads from server-recorded events (new analyses only). Older
          events may omit <code className="rounded bg-slate-100 px-1">analysis_id</code> or{" "}
          <code className="rounded bg-slate-100 px-1">duration_ms</code>.
        </p>

        <div className="table-scroll !mt-0">
          <table>
            <thead>
              <tr>
                <th>Event type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(byType).length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-8 text-center text-sm text-slate-500">
                    No events yet. Run an analysis to record completion metrics; open a PDF export to log downloads.
                  </td>
                </tr>
              ) : (
                Object.entries(byType)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{value}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
