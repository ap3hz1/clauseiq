import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { listAnalyses } from "@/lib/persistence";

export default async function HistoryPage() {
  let analyses: Awaited<ReturnType<typeof listAnalyses>> = [];
  try {
    const userId = await requireUserId();
    analyses = await listAnalyses(userId);
  } catch {
    return (
      <main className="container">
        <section className="card max-w-lg">
          <h1 className="title">Analysis history</h1>
          <p className="subtitle">You need to log in first.</p>
          <Link className="nav-link mt-4 inline-flex" href="/login">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="card">
        <div className="topbar mb-4">
          <div className="flex gap-3 sm:items-start">
            <Link href="/" className="back-arrow-link mt-0.5" aria-label="Back to analyzer">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="title">Analysis history</h1>
              <p className="subtitle">Open a past run or download its PDF.</p>
            </div>
          </div>
          <div className="topbar-actions actions-stack">
            <Link className="nav-link" href="/">
              Analyzer
            </Link>
          </div>
        </div>

        <div className="table-scroll">
          <table>
          <thead>
            <tr>
              <th>Upload date</th>
              <th>Property type</th>
              <th>Base lease file</th>
              <th>Redline file</th>
              <th>Property address</th>
              <th>Status</th>
              <th>Total changes</th>
              <th>Exposure</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((a) => {
              const row = a as typeof a & {
                property_address?: string | null;
                base_lease_filename?: string | null;
                redline_filename?: string | null;
              };
              return (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.property_type}</td>
                  <td className="max-w-[14rem] truncate" title={row.base_lease_filename ?? undefined}>
                    {row.base_lease_filename ?? "—"}
                  </td>
                  <td className="max-w-[14rem] truncate" title={row.redline_filename ?? undefined}>
                    {row.redline_filename ?? "—"}
                  </td>
                  <td>{row.property_address ?? "—"}</td>
                  <td>{a.status}</td>
                  <td>{a.total_changes}</td>
                  <td>
                    {Number(a.total_impact_low).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })} -{" "}
                    {Number(a.total_impact_high).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                  </td>
                  <td className="actions-stack">
                    <Link className="link-action" href={`/analyses/${a.id}`}>
                      Open
                    </Link>
                    <Link className="link-action" href={`/api/reports/${a.id}`} target="_blank" rel="noopener noreferrer">
                      PDF
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
