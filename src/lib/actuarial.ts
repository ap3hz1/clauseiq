import type { PropertyType } from "@/lib/types";

/**
 * Industry-keyed actuarial reference values.
 *
 * P_default = expected annual probability that a commercial tenant fails such
 * that the landlord must turn to a personal guarantee. Sigma = approximate
 * one-standard-deviation spread used to produce Low / Base / High estimates
 * per PRD §6.2.
 *
 * Values are seeded from commercial credit bureau and CMHC commercial default
 * studies for the Canadian market. They are intentionally configurable: this
 * is the only place to adjust them.
 */
interface DefaultRate {
  pDefault: number;
  sigma: number;
}

const DEFAULT_RATES: Record<PropertyType, DefaultRate> = {
  industrial: { pDefault: 0.05, sigma: 0.018 },
  office: { pDefault: 0.06, sigma: 0.022 },
  retail: { pDefault: 0.1, sigma: 0.03 },
  mixed_use: { pDefault: 0.07, sigma: 0.024 }
};

export function getDefaultRate(propertyType: PropertyType): DefaultRate {
  return DEFAULT_RATES[propertyType] ?? DEFAULT_RATES.office;
}

/**
 * Expected recovery rate from a personal guarantee, net of legal cost and
 * guarantor's other liabilities. PRD §6.2 leaves this as a single E_rec value.
 */
export const EXPECTED_RECOVERY_RATE = 0.2;

/**
 * Default operating-cost estimate by property type (CAD per rentable sqft per
 * year, fully-loaded). Used only when the user leaves operating cost blank
 * AND the analysis explicitly opts into a system estimate (PRD §4.1).
 */
export const DEFAULT_OPERATING_COST_PSF: Record<PropertyType, number> = {
  industrial: 6,
  office: 14,
  retail: 11,
  mixed_use: 11
};

/**
 * ASHRAE / BOMA equipment lifespan reference data (years) for actuarial
 * quantification of replacement-event probabilities during a lease term.
 */
export const EQUIPMENT_LIFESPAN_YEARS = {
  hvac_rooftop_unit: 15,
  hvac_boiler: 25,
  roof_membrane: 20,
  structural_envelope: 60
} as const;

/**
 * Average replacement cost ($ per rentable sqft) drawn from RSMeans / BOMA
 * benchmarks for typical mid-market Canadian commercial buildings.
 */
export const REPLACEMENT_COST_PSF = {
  hvac: 35,
  roof: 18,
  structural_repair_annual: 2.8
} as const;
