import { toBase } from './units';

/**
 * How much prepped (chopped/minced/diced/sliced/juiced) volume one average
 * whole piece of produce yields — so a shopping-list total like "1½ cups
 * onion" can be shown as "2 onions" instead, since nobody buys a cup of
 * onion at the store.
 *
 * `pieceUnit` is the physically-shoppable unit: '' for a bare whole piece
 * ("2 onions"), or an existing countable unit the ingredient parser already
 * recognizes ("clove", "stalk", "head", "bunch", "ear") for produce that's
 * naturally sub-divided that way.
 *
 * These are approximate, standard culinary reference yields (produce size
 * varies a good deal in real life) — aggregation always rounds the result
 * up, never down, so an estimate errs toward buying slightly more rather
 * than coming up short.
 */
interface YieldSpec {
  pieceUnit: string;
  /** [quantity, unit] of prepped volume one piece yields, e.g. [1, 'cup']. */
  yield: [number, string];
}

const YIELD_SPECS: Record<string, YieldSpec> = {
  // --- Alliums ---
  onion: { pieceUnit: '', yield: [1, 'cup'] },
  'red onion': { pieceUnit: '', yield: [1, 'cup'] },
  shallot: { pieceUnit: '', yield: [3, 'tbsp'] },
  garlic: { pieceUnit: 'clove', yield: [1, 'tsp'] },
  leek: { pieceUnit: '', yield: [1, 'cup'] },
  scallion: { pieceUnit: '', yield: [2, 'tbsp'] },

  // --- Roots & tubers ---
  celery: { pieceUnit: 'stalk', yield: [0.5, 'cup'] },
  carrot: { pieceUnit: '', yield: [0.5, 'cup'] },
  potato: { pieceUnit: '', yield: [1, 'cup'] },
  'sweet potato': { pieceUnit: '', yield: [1, 'cup'] },
  beet: { pieceUnit: '', yield: [0.5, 'cup'] },
  radish: { pieceUnit: '', yield: [0.25, 'cup'] },
  turnip: { pieceUnit: '', yield: [0.5, 'cup'] },
  parsnip: { pieceUnit: '', yield: [0.5, 'cup'] },
  ginger: { pieceUnit: '', yield: [1, 'tbsp'] },
  jicama: { pieceUnit: '', yield: [1, 'cup'] },
  'celery root': { pieceUnit: '', yield: [1, 'cup'] },
  celeriac: { pieceUnit: '', yield: [1, 'cup'] },
  kohlrabi: { pieceUnit: '', yield: [1, 'cup'] },
  rutabaga: { pieceUnit: '', yield: [1, 'cup'] },
  daikon: { pieceUnit: '', yield: [1, 'cup'] },

  // --- Nightshades & fruiting vegetables ---
  tomato: { pieceUnit: '', yield: [0.75, 'cup'] },
  'bell pepper': { pieceUnit: '', yield: [1, 'cup'] },
  jalapeno: { pieceUnit: '', yield: [2, 'tbsp'] },
  poblano: { pieceUnit: '', yield: [0.75, 'cup'] },
  serrano: { pieceUnit: '', yield: [1, 'tbsp'] },
  eggplant: { pieceUnit: '', yield: [4, 'cup'] },
  cucumber: { pieceUnit: '', yield: [1.5, 'cup'] },
  zucchini: { pieceUnit: '', yield: [2, 'cup'] },
  'yellow squash': { pieceUnit: '', yield: [2, 'cup'] },
  'summer squash': { pieceUnit: '', yield: [2, 'cup'] },
  avocado: { pieceUnit: '', yield: [1, 'cup'] },

  // --- Squash & gourds ---
  'butternut squash': { pieceUnit: '', yield: [4, 'cup'] },
  'acorn squash': { pieceUnit: '', yield: [2, 'cup'] },
  'spaghetti squash': { pieceUnit: '', yield: [4, 'cup'] },
  pumpkin: { pieceUnit: '', yield: [4, 'cup'] },

  // --- Cruciferous & leafy ---
  broccoli: { pieceUnit: 'head', yield: [2.5, 'cup'] },
  cauliflower: { pieceUnit: 'head', yield: [3, 'cup'] },
  cabbage: { pieceUnit: 'head', yield: [9, 'cup'] },
  'red cabbage': { pieceUnit: 'head', yield: [9, 'cup'] },
  'napa cabbage': { pieceUnit: 'head', yield: [6, 'cup'] },
  'bok choy': { pieceUnit: 'head', yield: [1.5, 'cup'] },
  lettuce: { pieceUnit: 'head', yield: [6, 'cup'] },
  'romaine lettuce': { pieceUnit: 'head', yield: [6, 'cup'] },
  'iceberg lettuce': { pieceUnit: 'head', yield: [8, 'cup'] },
  kale: { pieceUnit: 'bunch', yield: [4, 'cup'] },
  chard: { pieceUnit: 'bunch', yield: [4, 'cup'] },
  'collard green': { pieceUnit: 'bunch', yield: [4, 'cup'] },
  arugula: { pieceUnit: 'bunch', yield: [3, 'cup'] },
  fennel: { pieceUnit: '', yield: [1.5, 'cup'] },

  // --- Pods & other vegetables ---
  'brussels sprout': { pieceUnit: '', yield: [0.25, 'cup'] },
  mushroom: { pieceUnit: '', yield: [0.25, 'cup'] },
  corn: { pieceUnit: 'ear', yield: [0.75, 'cup'] },
  asparagus: { pieceUnit: 'bunch', yield: [3, 'cup'] },
  artichoke: { pieceUnit: '', yield: [1, 'cup'] },
  okra: { pieceUnit: '', yield: [1.5, 'tbsp'] },

  // --- Citrus ---
  lemon: { pieceUnit: '', yield: [3, 'tbsp'] },
  'lemon juice': { pieceUnit: '', yield: [3, 'tbsp'] },
  lime: { pieceUnit: '', yield: [2, 'tbsp'] },
  'lime juice': { pieceUnit: '', yield: [2, 'tbsp'] },
  orange: { pieceUnit: '', yield: [0.33, 'cup'] },
  grapefruit: { pieceUnit: '', yield: [0.75, 'cup'] },

  // --- Pome, stone & tropical fruit ---
  apple: { pieceUnit: '', yield: [1, 'cup'] },
  pear: { pieceUnit: '', yield: [1, 'cup'] },
  peach: { pieceUnit: '', yield: [1, 'cup'] },
  plum: { pieceUnit: '', yield: [0.5, 'cup'] },
  apricot: { pieceUnit: '', yield: [0.25, 'cup'] },
  nectarine: { pieceUnit: '', yield: [1, 'cup'] },
  banana: { pieceUnit: '', yield: [0.5, 'cup'] },
  mango: { pieceUnit: '', yield: [1, 'cup'] },
  pineapple: { pieceUnit: '', yield: [3, 'cup'] },
  papaya: { pieceUnit: '', yield: [1.5, 'cup'] },
  kiwi: { pieceUnit: '', yield: [0.5, 'cup'] },
  cantaloupe: { pieceUnit: '', yield: [4, 'cup'] },
  honeydew: { pieceUnit: '', yield: [4, 'cup'] },
  watermelon: { pieceUnit: '', yield: [6, 'cup'] },
  pomegranate: { pieceUnit: '', yield: [1, 'cup'] },
  fig: { pieceUnit: '', yield: [0.25, 'cup'] },
  date: { pieceUnit: '', yield: [1, 'tbsp'] },
  persimmon: { pieceUnit: '', yield: [0.5, 'cup'] },
  coconut: { pieceUnit: '', yield: [3, 'cup'] },
  plantain: { pieceUnit: '', yield: [1, 'cup'] },

  // --- Fresh herbs, sold in bunches ---
  cilantro: { pieceUnit: 'bunch', yield: [1, 'cup'] },
  parsley: { pieceUnit: 'bunch', yield: [1, 'cup'] },
  basil: { pieceUnit: 'bunch', yield: [1, 'cup'] },
  mint: { pieceUnit: 'bunch', yield: [0.5, 'cup'] },
  dill: { pieceUnit: 'bunch', yield: [0.5, 'cup'] },
};

export interface ProduceYield {
  pieceUnit: string;
  mlPerPiece: number;
}

/** Precomputed to mL once at module load — see `YIELD_SPECS` for the source data. */
export const PRODUCE_YIELDS: Record<string, ProduceYield> = Object.fromEntries(
  Object.entries(YIELD_SPECS).map(([name, spec]) => {
    const base = toBase(spec.yield[0], spec.yield[1]);
    if (!base) throw new Error(`Non-volume yield unit for "${name}": ${spec.yield[1]}`);
    return [name, { pieceUnit: spec.pieceUnit, mlPerPiece: base.quantity }];
  }),
);
