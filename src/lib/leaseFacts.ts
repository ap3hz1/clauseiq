/** Extract free-rent months from revised (inserted) text first, then combined. */
export function extractFreeRentMonths(inserted: string, deleted: string): number | null {
  const sources = [inserted, `${inserted} ${deleted}`];
  for (const s of sources) {
    const m =
      s.match(/period of\s+(?:[a-z]+\s+)?\(?(\d+)\)?\s*(?:full\s+)?calendar\s+months/i) ||
      s.match(/being\s+a\s+period\s+of\s+(?:[a-z]+\s+)?\(?(\d+)\)?\s*(?:full\s+)?calendar\s+months/i) ||
      s.match(/(\d+)\s*\(\d+\)\s*full\s+calendar\s+months/i) ||
      s.match(/(\d+)\s+full\s+calendar\s+months/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 60) return n;
    }
  }
  return null;
}

/** Delta $/sqft between two TI rates in the same change (e.g. 45 vs 60). */
export function extractTiDeltaPsfPerSqFt(inserted: string, deleted: string): number | null {
  const combined = `${inserted} ${deleted}`.replace(/,/g, "");
  const re = /\$\s*([\d.]+)\s+per\s+rentable\s+square\s+foot/gi;
  const vals: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v) && v > 0 && v < 500) vals.push(v);
  }
  if (vals.length >= 2) {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const d = hi - lo;
    if (d > 0 && d < 200) return d;
  }
  return null;
}
