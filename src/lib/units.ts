/**
 * Unit recognition, conversion to base units (mL for volume, g for weight),
 * and human-readable formatting of aggregated totals.
 */

export type UnitKind = 'volume' | 'weight' | 'other';

interface UnitDef {
  canonical: string;
  kind: UnitKind;
  /** Factor to base unit (mL or g). Undefined for 'other'. */
  toBase?: number;
}

const UNIT_DEFS: UnitDef[] = [
  // volume (base: mL)
  { canonical: 'cup', kind: 'volume', toBase: 236.588 },
  { canonical: 'tbsp', kind: 'volume', toBase: 14.7868 },
  { canonical: 'tsp', kind: 'volume', toBase: 4.92892 },
  { canonical: 'fl oz', kind: 'volume', toBase: 29.5735 },
  { canonical: 'pint', kind: 'volume', toBase: 473.176 },
  { canonical: 'quart', kind: 'volume', toBase: 946.353 },
  { canonical: 'gallon', kind: 'volume', toBase: 3785.41 },
  { canonical: 'ml', kind: 'volume', toBase: 1 },
  { canonical: 'l', kind: 'volume', toBase: 1000 },
  // weight (base: g)
  { canonical: 'g', kind: 'weight', toBase: 1 },
  { canonical: 'kg', kind: 'weight', toBase: 1000 },
  { canonical: 'oz', kind: 'weight', toBase: 28.3495 },
  { canonical: 'lb', kind: 'weight', toBase: 453.592 },
];

/** Maps every accepted spelling to its canonical unit. */
const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup', cups: 'cup', c: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tb: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
  'fl oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', floz: 'fl oz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart', qts: 'quart',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  gram: 'g', grams: 'g', g: 'g', gr: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg', kgs: 'kg',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  // countable / non-convertible units kept as-is (not summed with unlike units)
  clove: 'clove', cloves: 'clove',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  package: 'package', packages: 'package', pkg: 'package',
  slice: 'slice', slices: 'slice',
  stick: 'stick', sticks: 'stick',
  stalk: 'stalk', stalks: 'stalk',
  sprig: 'sprig', sprigs: 'sprig',
  head: 'head', heads: 'head',
  bunch: 'bunch', bunches: 'bunch',
  piece: 'piece', pieces: 'piece',
  handful: 'handful', handfuls: 'handful',
};

const DEFS_BY_CANONICAL = new Map(UNIT_DEFS.map((d) => [d.canonical, d]));

/** Returns the canonical unit for a raw token, or null if unrecognized. */
export function canonicalUnit(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\.$/, '').trim();
  return UNIT_ALIASES[key] ?? null;
}

export function unitKind(canonical: string): UnitKind {
  return DEFS_BY_CANONICAL.get(canonical)?.kind ?? 'other';
}

/**
 * Converts a quantity in a canonical unit to its base unit.
 * Returns null when the unit is not convertible (counts, pinches, cloves…).
 */
export function toBase(quantity: number, canonical: string): { quantity: number; baseUnit: 'ml' | 'g' } | null {
  const def = DEFS_BY_CANONICAL.get(canonical);
  if (!def || def.toBase === undefined) return null;
  return {
    quantity: quantity * def.toBase,
    baseUnit: def.kind === 'volume' ? 'ml' : 'g',
  };
}

const NICE_FRACTIONS: Array<[number, string]> = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.375, '⅜'],
  [0.5, '½'],
  [0.625, '⅝'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
  [0.875, '⅞'],
];

/**
 * Formats a number with a unicode fraction when it lands near one
 * (e.g., 0.5 → "½", 1.75 → "1¾"); falls back to a trimmed decimal.
 */
export function formatQuantity(value: number): string {
  if (value === 0) return '';
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.04) return String(whole === 0 ? round2(value) : whole);
  for (const [f, glyph] of NICE_FRACTIONS) {
    if (Math.abs(frac - f) < 0.04) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  return String(round2(value));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** True when a value formats as a whole number or a nice unicode fraction. */
function landsOnNiceValue(value: number): boolean {
  const frac = value - Math.floor(value + 1e-9);
  if (frac < 0.04) return true;
  return NICE_FRACTIONS.some(([f]) => Math.abs(frac - f) < 0.04);
}

/**
 * Converts an aggregated base-unit total back to the most human-readable
 * unit for a shopping list.
 *
 * Volume: ≥ 2 cups → cups; ≥ 1 tbsp → tbsp; otherwise tsp.
 * Weight: ≥ 1 lb → lb; ≥ 28 g stays in g under 1 kg for metric-friendliness,
 *         but oz reads better between 1 oz and 1 lb for imperial recipes,
 *         so: ≥ 453.592 g → lb; ≥ 100 g → g; ≥ 28.35 g → oz; else g.
 */
export function toReadable(baseQuantity: number, baseUnit: 'ml' | 'g'): { quantity: number; unit: string } {
  if (baseUnit === 'ml') {
    if (baseQuantity >= 236.588 / 4) {
      const cups = baseQuantity / 236.588;
      const tbsp = baseQuantity / 14.7868;
      // "9 tbsp" reads better than "0.56 cup" — prefer tbsp when the cup
      // amount is awkward but the tbsp amount is clean, below 1 cup.
      if (cups < 1 && !landsOnNiceValue(cups) && landsOnNiceValue(tbsp)) {
        return { quantity: tbsp, unit: 'tbsp' };
      }
      return { quantity: cups, unit: 'cup' };
    }
    if (baseQuantity >= 14.7868) return { quantity: baseQuantity / 14.7868, unit: 'tbsp' };
    return { quantity: baseQuantity / 4.92892, unit: 'tsp' };
  }
  if (baseQuantity >= 453.592) return { quantity: baseQuantity / 453.592, unit: 'lb' };
  if (baseQuantity >= 100) return { quantity: baseQuantity, unit: 'g' };
  if (baseQuantity >= 28.3495) return { quantity: baseQuantity / 28.3495, unit: 'oz' };
  return { quantity: baseQuantity, unit: 'g' };
}

/** Pluralizes a display unit when the quantity calls for it. */
export function displayUnit(unit: string, quantity: number): string {
  if (!unit) return '';
  const plural: Record<string, string> = {
    cup: 'cups', pint: 'pints', quart: 'quarts', gallon: 'gallons',
    clove: 'cloves', pinch: 'pinches', dash: 'dashes', can: 'cans',
    jar: 'jars', package: 'packages', slice: 'slices', stick: 'sticks',
    stalk: 'stalks', sprig: 'sprigs', head: 'heads', bunch: 'bunches',
    piece: 'pieces', handful: 'handfuls',
  };
  if (quantity > 1 && plural[unit]) return plural[unit];
  return unit;
}
