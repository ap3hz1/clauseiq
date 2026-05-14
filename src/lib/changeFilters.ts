/** Raw parser row before classification */
export interface RawParsedChange {
  change_type: string;
  inserted_text: string;
  deleted_text: string;
  before_text?: string;
  after_text?: string;
}

const NOISE_SUBSTRINGS = [
  "testing purposes only",
  "tenant-favorable negotiation draft",
  "negotiation draft",
  "appendix — lease summary",
  "appendix - lease summary",
  "lease summary data",
  "summary is provided for reference",
  "in the event of any conflict between this summary and the body of the lease"
];

const MIN_COMBINED_LEN = 12;

function combinedText(row: RawParsedChange): string {
  return `${row.inserted_text} ${row.deleted_text}`.trim();
}

export function isNoiseParsedChange(row: RawParsedChange): boolean {
  const t = combinedText(row).toLowerCase();
  if (t.length < MIN_COMBINED_LEN) return true;
  return NOISE_SUBSTRINGS.some((s) => t.includes(s));
}

export function filterNoiseParsedChanges(rows: RawParsedChange[]): RawParsedChange[] {
  return rows.filter((r) => !isNoiseParsedChange(r));
}
