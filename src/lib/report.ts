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

export function renderReportText(input: {
  property: string;
  analyst: string;
  createdAt: string;
  totalLow: number;
  totalHigh: number;
  signal: string;
  changes: ReportChange[];
}) {
  const header = [
    "ClauseIQ Change Risk Register",
    `Property: ${input.property}`,
    `Analyst: ${input.analyst}`,
    `Analysis date: ${input.createdAt}`,
    `Exposure range: ${input.totalLow} - ${input.totalHigh}`,
    `Signal: ${input.signal}`,
    "",
    "Disclaimer: ClauseIQ provides decision-support estimates, not legal or financial advice."
  ];
  const rows = input.changes.map(
    (c, idx) =>
      `${idx + 1}. ${c.clause_type} | ${c.change_summary} | ${c.impact_low ?? "Q"}-${c.impact_high ?? "Q"} | ${
        c.method
      }/${c.confidence} | ${c.recommendation} | notes:${c.user_notes ?? ""}`
  );
  return [...header, "", ...rows].join("\n");
}

export function textToSimplePdf(text: string): Uint8Array {
  const safeText = text.replace(/[()]/g, "");
  const stream = `BT /F1 10 Tf 40 780 Td (${safeText.slice(0, 5000).replace(/\n/g, ") Tj T* (")}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
