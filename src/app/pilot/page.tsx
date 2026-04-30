import { requireUserId } from "@/lib/auth";
import { listMetrics } from "@/lib/persistence";

export default async function PilotPage() {
  let metrics: Awaited<ReturnType<typeof listMetrics>> = [];
  try {
    const userId = await requireUserId();
    metrics = await listMetrics(userId);
  } catch {
    return (
      <main className="container">
        <section className="card">
          <h1>Pilot Metrics</h1>
          <p>Login required.</p>
        </section>
      </main>
    );
  }

  const byType = metrics.reduce<Record<string, number>>((acc, item) => {
    acc[item.event_type] = (acc[item.event_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="container">
      <section className="card">
        <h1>Pilot Metrics Dashboard</h1>
        <p>Events collected: {metrics.length}</p>
        <table>
          <thead>
            <tr>
              <th>Event Type</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byType).map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
