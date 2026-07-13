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
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tb: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsp: 'tsp',
  tsps: 'tsp',
  'fl oz': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  floz: 'fl oz',
  pint: 'pint',
  pints: 'pint',
  pt: 'pint',
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  qts: 'quart',
  gallon: 'gallon',
  gallons: 'gallon',
  gal: 'gallon',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  ml: 'ml',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  l: 'l',
  gram: 'g',
  grams: 'g',
  g: 'g',
  gr: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  kgs: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lb: 'lb',
  lbs: 'lb',
  // countable / non-convertible units kept as-is (not summed with unlike units)
  clove: 'clove',
  cloves: 'clove',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  can: 'can',
  cans: 'can',
  jar: 'jar',
  jars: 'jar',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  slice: 'slice',
  slices: 'slice',
  stick: 'stick',
  sticks: 'stick',
  stalk: 'stalk',
  stalks: 'stalk',
  sprig: 'sprig',
  sprigs: 'sprig',
  head: 'head',
  heads: 'head',
  bunch: 'bunch',
  bunches: 'bunch',
  piece: 'piece',
  pieces: 'piece',
  handful: 'handful',
  handfuls: 'handful',
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
export function toBase(
  quantity: number,
  canonical: string,
): { quantity: number; baseUnit: 'ml' | 'g' } | null {
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

/** The user's preferred measurement system for computed (shopping) amounts. */
export type UnitSystem = 'imperial' | 'metric';

/** Rounds a value UP to the nearest multiple of `step` (24 for 23.3 at step 1). */
function roundUpTo(value: number, step: number): number {
  // A *relative* epsilon absorbs the small inconsistencies between our
  // conversion constants (e.g. tbsp isn't exactly 1/16 cup), which otherwise
  // accumulate when a recipe is scaled up — 168 tbsp is 10.5 cups, not 10.75.
  // 0.01% is far below one real step, so an amount genuinely past a boundary
  // still rounds up.
  const n = value / step;
  const eps = Math.max(1e-9, Math.abs(n) * 1e-4);
  return Math.ceil(n - eps) * step;
}

/**
 * Converts an aggregated base-unit total into a single, consistent unit for the
 * chosen system, rounded up to a sensible shopping amount (never a fiddly
 * "340.19 g" — always the next tidy step up).
 *
 * Imperial weight: lb (≥1 lb) / oz, rounded up to ¼.
 * Metric weight:   kg (≥1 kg) / g, rounded up to 0.05 kg / 5 g / 1 g.
 * Imperial volume: cups (≥¼ cup) / tbsp / tsp, rounded up to ¼ or ½.
 * Metric volume:   L (≥1 L) / mL, rounded up to 0.05 L / 10 mL / 5 mL.
 */
export function toReadable(
  baseQuantity: number,
  baseUnit: 'ml' | 'g',
  system: UnitSystem = 'imperial',
): { quantity: number; unit: string } {
  if (baseUnit === 'g') {
    if (system === 'metric') {
      if (baseQuantity >= 1000)
        return { quantity: roundUpTo(baseQuantity / 1000, 0.05), unit: 'kg' };
      if (baseQuantity >= 100) return { quantity: roundUpTo(baseQuantity, 5), unit: 'g' };
      return { quantity: roundUpTo(baseQuantity, 1), unit: 'g' };
    }
    if (baseQuantity >= 453.592)
      return { quantity: roundUpTo(baseQuantity / 453.592, 0.25), unit: 'lb' };
    return { quantity: roundUpTo(baseQuantity / 28.3495, 0.25), unit: 'oz' };
  }

  // volume (base mL)
  if (system === 'metric') {
    if (baseQuantity >= 1000) return { quantity: roundUpTo(baseQuantity / 1000, 0.05), unit: 'l' };
    if (baseQuantity >= 100) return { quantity: roundUpTo(baseQuantity, 10), unit: 'ml' };
    return { quantity: roundUpTo(baseQuantity, 5), unit: 'ml' };
  }
  if (baseQuantity >= 236.588 / 4)
    return { quantity: roundUpTo(baseQuantity / 236.588, 0.25), unit: 'cup' };
  if (baseQuantity >= 14.7868)
    return { quantity: roundUpTo(baseQuantity / 14.7868, 0.5), unit: 'tbsp' };
  return { quantity: roundUpTo(baseQuantity / 4.92892, 0.25), unit: 'tsp' };
}

/** Units shown as plain numbers (metric); everything else uses nice fractions. */
const PLAIN_NUMBER_UNITS = new Set(['g', 'kg', 'ml', 'l']);

/**
 * Formats a computed amount: plain trimmed decimals for metric units
 * (24 g, 1.8 kg, 250 mL), friendly fractions for imperial/counts (1¾, ½).
 */
export function formatAmount(quantity: number, unit: string): string {
  if (quantity === 0) return '';
  if (PLAIN_NUMBER_UNITS.has(unit)) return String(round2(quantity));
  return formatQuantity(quantity);
}

/** Pluralizes / cases a display unit for the given quantity. */
export function displayUnit(unit: string, quantity: number): string {
  if (!unit) return '';
  if (unit === 'ml') return 'mL';
  if (unit === 'l') return 'L';
  const plural: Record<string, string> = {
    cup: 'cups',
    pint: 'pints',
    quart: 'quarts',
    gallon: 'gallons',
    clove: 'cloves',
    pinch: 'pinches',
    dash: 'dashes',
    can: 'cans',
    jar: 'jars',
    package: 'packages',
    slice: 'slices',
    stick: 'sticks',
    stalk: 'stalks',
    sprig: 'sprigs',
    head: 'heads',
    bunch: 'bunches',
    piece: 'pieces',
    handful: 'handfuls',
  };
  if (quantity > 1 && plural[unit]) return plural[unit];
  return unit;
}
