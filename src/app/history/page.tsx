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
        <section className="card">
          <h1>Analysis History</h1>
          <p>You need to log in first.</p>
          <Link href="/login">Go to login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="card">
        <h1>Analysis History</h1>
        <Link href="/">Back to analyzer</Link>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Property Type</th>
              <th>Status</th>
              <th>Total Changes</th>
              <th>Exposure</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.property_type}</td>
                <td>{a.status}</td>
                <td>{a.total_changes}</td>
                <td>
                  {Number(a.total_impact_low).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })} -{" "}
                  {Number(a.total_impact_high).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                </td>
                <td>
                  <Link href={`/api/reports/${a.id}`}>Download PDF</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
