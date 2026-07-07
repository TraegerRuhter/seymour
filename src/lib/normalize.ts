/**
 * Ingredient name normalization: lowercase, trim adjectives/synonyms via a
 * curated mapping, and a light suffix stripper so "tomatoes" and "tomato"
 * aggregate together.
 */

/** Curated synonym map. Keys and values are lowercase singular-ish forms. */
const SYNONYMS: Record<string, string> = {
  'yellow onion': 'onion',
  'brown onion': 'onion',
  'white onion': 'onion',
  'red onion': 'red onion', // distinct enough to keep separate
  'spring onion': 'scallion',
  'green onion': 'scallion',
  'scallion': 'scallion',
  'garlic clove': 'garlic',
  'clove of garlic': 'garlic',
  'cloves garlic': 'garlic',
  'garlic': 'garlic',
  'red bell pepper': 'bell pepper',
  'green bell pepper': 'bell pepper',
  'yellow bell pepper': 'bell pepper',
  'orange bell pepper': 'bell pepper',
  'capsicum': 'bell pepper',
  'roma tomato': 'tomato',
  'plum tomato': 'tomato',
  'vine tomato': 'tomato',
  'cherry tomato': 'cherry tomato',
  'coriander leaves': 'cilantro',
  'fresh coriander': 'cilantro',
  'coriander leaf': 'cilantro',
  'all-purpose flour': 'flour',
  'all purpose flour': 'flour',
  'plain flour': 'flour',
  'ap flour': 'flour',
  'granulated sugar': 'sugar',
  'white sugar': 'sugar',
  'caster sugar': 'sugar',
  'kosher salt': 'salt',
  'sea salt': 'salt',
  'table salt': 'salt',
  'fine salt': 'salt',
  'extra virgin olive oil': 'olive oil',
  'extra-virgin olive oil': 'olive oil',
  'evoo': 'olive oil',
  'unsalted butter': 'butter',
  'salted butter': 'butter',
  'whole milk': 'milk',
  'skim milk': 'milk',
  '2% milk': 'milk',
  'large egg': 'egg',
  'large eggs': 'egg',
  'medium egg': 'egg',
  'small egg': 'egg',
  'freshly ground black pepper': 'black pepper',
  'ground black pepper': 'black pepper',
  'cracked black pepper': 'black pepper',
  'boneless skinless chicken breast': 'chicken breast',
  'boneless chicken breast': 'chicken breast',
  'skinless chicken breast': 'chicken breast',
  'chicken breast half': 'chicken breast',
  'chicken breast halves': 'chicken breast',
  'italian parsley': 'parsley',
  'flat-leaf parsley': 'parsley',
  'flat leaf parsley': 'parsley',
  'fresh parsley': 'parsley',
  'baby spinach': 'spinach',
  'fresh spinach': 'spinach',
  'parmesan cheese': 'parmesan',
  'parmigiano reggiano': 'parmesan',
  'parmigiano-reggiano': 'parmesan',
  'cheddar cheese': 'cheddar',
  'sharp cheddar': 'cheddar',
  'sharp cheddar cheese': 'cheddar',
  'low-sodium soy sauce': 'soy sauce',
  'light soy sauce': 'soy sauce',
  'low sodium chicken broth': 'chicken broth',
  'low-sodium chicken broth': 'chicken broth',
  'chicken stock': 'chicken broth',
  'vegetable stock': 'vegetable broth',
  'long-grain rice': 'rice',
  'long grain rice': 'rice',
  'white rice': 'rice',
  'basmati rice': 'basmati rice',
  'fresh ginger': 'ginger',
  'ginger root': 'ginger',
  'fresh lemon juice': 'lemon juice',
  'juice of 1 lemon': 'lemon juice',
  'fresh lime juice': 'lime juice',
  'heavy whipping cream': 'heavy cream',
  'double cream': 'heavy cream',
};

/** Leading descriptors that rarely change what you buy. */
const DROPPABLE_PREFIXES = [
  'fresh', 'freshly', 'large', 'medium', 'small', 'ripe', 'raw', 'cold',
  'warm', 'room temperature', 'organic', 'good quality', 'good-quality',
  'finely', 'roughly', 'thinly', 'coarsely', 'lightly',
];

/** Trailing preparation words that describe technique, not the item. */
const DROPPABLE_SUFFIXES = [
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'peeled',
  'crushed', 'melted', 'softened', 'beaten', 'divided', 'optional',
  'to taste', 'for serving', 'for garnish', 'plus more',
];

function stripAffixes(name: string): string {
  let out = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of DROPPABLE_PREFIXES) {
      if (out.startsWith(p + ' ')) {
        out = out.slice(p.length + 1);
        changed = true;
      }
    }
    for (const s of DROPPABLE_SUFFIXES) {
      if (out.endsWith(' ' + s)) {
        out = out.slice(0, -(s.length + 1));
        changed = true;
      }
      if (out.endsWith(', ' + s)) {
        out = out.slice(0, -(s.length + 2));
        changed = true;
      }
    }
  }
  return out.trim();
}

/** Light stemmer: strips plural endings from the final word ("tomatoes" → "tomato"). */
function stemLastWord(name: string): string {
  const words = name.split(' ');
  const last = words[words.length - 1];
  let stemmed = last;
  if (last.length > 3) {
    if (last.endsWith('oes')) stemmed = last.slice(0, -2);
    else if (last.endsWith('ies')) stemmed = last.slice(0, -3) + 'y';
    else if (last.endsWith('ses') || last.endsWith('xes') || last.endsWith('ches') || last.endsWith('shes')) {
      stemmed = last.slice(0, -2);
    } else if (last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us')) {
      stemmed = last.slice(0, -1);
    }
  }
  words[words.length - 1] = stemmed;
  return words.join(' ');
}

/**
 * Normalizes an ingredient name for aggregation:
 * lowercase → strip descriptors → synonym map → plural stemming → synonym map again.
 */
export function normalizeIngredientName(raw: string): string {
  let name = raw
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, ' ') // drop parentheticals
    .replace(/[*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '');

  if (!name) return name;
  if (SYNONYMS[name]) return SYNONYMS[name];

  name = stripAffixes(name);
  if (SYNONYMS[name]) return SYNONYMS[name];

  name = stemLastWord(name);
  if (SYNONYMS[name]) return SYNONYMS[name];

  return name;
}
