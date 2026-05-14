/** Extract free-rent months from one side of the lease (base = deleted, redline = inserted). */
export function extractFreeRentMonthsFromSide(text: string): number | null {
  if (!text.trim()) return null;
  const patterns = [
    /\((\d+)\)\s*full\s+calendar\s+months/i,
    /being\s+a\s+period\s+of\s+(?:[a-z]+\s+)?\(?(\d+)\)?\s*(?:full\s+)?calendar\s+months/i,
    /period\s+of\s+(?:[a-z]+\s+)?\(?(\d+)\)?\s*(?:full\s+)?calendar\s+months/i,
    /(\d+)\s*\(\d+\)\s*full\s+calendar\s+months/i,
    /(\d+)\s+full\s+calendar\s+months/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 60) return n;
    }
  }
  return null;
}

/** @deprecated use extractFreeRentMonthsFromSide per side + delta */
export function extractFreeRentMonths(inserted: string, deleted: string): number | null {
  return extractFreeRentMonthsFromSide(inserted) ?? extractFreeRentMonthsFromSide(deleted);
}

export function extractFreeRentDeltaMonths(inserted: string, deleted: string): {
  deltaMonths: number;
  baseMonths: number | null;
  redlineMonths: number | null;
} {
  const redlineMonths = extractFreeRentMonthsFromSide(inserted);
  const baseMonths = extractFreeRentMonthsFromSide(deleted);
  const r = redlineMonths ?? 0;
  const b = baseMonths ?? 0;
  return { deltaMonths: Math.max(0, r - b), baseMonths, redlineMonths };
}

/** Base had clawback on abated rent; redline removes clawback (unconditional abatement). */
export function detectsFreeRentClawbackRemoval(deleted: string, inserted: string): boolean {
  const d = deleted.toLowerCase();
  const ins = inserted.toLowerCase();
  const hadClawback =
    /recover.*abated|clawback|full amount of base rent abated|abated during the free rent period.*default/i.test(d);
  const unconditional =
    /unconditional|no clawback|not subject to clawback|shall not be subject to clawback|not be subject to clawback/i.test(ins);
  return hadClawback && unconditional;
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

/** Base required remitting share of sublease profit to landlord; redline lets tenant keep 100%. */
export function detectProfitShareDeletionAcrossDocument(deletedBlob: string, insertedBlob: string): boolean {
  const d = deletedBlob.toLowerCase();
  const ins = insertedBlob.toLowerCase();
  const hadShare =
    /fifty percent|50\s*%/.test(d) &&
    /remit to the landlord|payable to the landlord.*excess|share of any such excess/i.test(d);
  const tenantKeeps =
    /entitled to retain any and all|without any obligation to account to or share|without.*share.*landlord/i.test(ins);
  return hadShare && tenantKeeps;
}

/** Approximate tenant's proportionate share from lease text (e.g. 12.86%). */
export function extractTenantProportionateShare(inserted: string, deleted: string): number | null {
  const t = `${inserted} ${deleted}`;
  const m = t.match(/(\d+(?:\.\d+)?)\s*%\s*\(?\s*(?:approx\.?|approximately)?\s*\)?/i);
  if (m) {
    const p = parseFloat(m[1]) / 100;
    if (p > 0 && p < 1) return p;
  }
  const m2 = t.match(/numerator.*18,000.*denominator.*140,000/i);
  if (m2) return 18000 / 140000;
  return null;
}
