import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every .ts/.tsx under a directory, relative to the repo root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}
import { readFileSync } from 'node:fs';

/**
 * The palette lives in CSS, so this reads the real tokens out of globals.css
 * rather than duplicating them here — a test that asserts against its own copy
 * of the numbers would pass forever no matter what shipped.
 *
 * Every pair below is a combination the UI actually renders. The thresholds
 * are WCAG AA: 4.5:1 for body text, 3:1 for large text and for non-text UI
 * that has to be distinguishable (a button against the page behind it).
 */

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

/** Pulls one theme's `--color-*` declarations out of its selector block. */
function tokens(selector: string): Record<string, [number, number, number]> {
  const start = CSS.indexOf(selector + ' {');
  assert.notEqual(start, -1, `no ${selector} block in globals.css`);
  // Stop at the block's own closing brace whatever its indentation — `.dark`
  // is nested inside `@media screen`, so looking for a `}` in column 0 would
  // sail past it and pick up whatever came next in the media block.
  const end = CSS.slice(start).search(/\n\s*\}/);
  assert.notEqual(end, -1, `unterminated ${selector} block in globals.css`);
  const block = CSS.slice(start, start + end);
  const out: Record<string, [number, number, number]> = {};
  for (const [, name, rgb] of block.matchAll(/--color-([\w-]+):\s*(\d+ \d+ \d+)/g)) {
    const [r, g, b] = rgb.split(' ').map(Number);
    out[name] = [r, g, b];
  }
  return out;
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];

for (const theme of ['light', 'dark'] as const) {
  const t = tokens(theme === 'light' ? ':root' : '.dark');

  const pairs: Array<[string, [number, number, number], [number, number, number], number]> = [
    ['body text on the page', t.ink, t.bg, 4.5],
    ['body text on a card', t.ink, t.surface, 4.5],
    ['white on a primary button', WHITE, t.moss, 4.5],
    ['a link on the page', t['moss-strong'], t.bg, 4.5],
    ['a link on a card', t['moss-strong'], t.surface, 4.5],
    ['accent text on the page', t['zest-strong'], t.bg, 4.5],
    ['ink on an accent fill', t['zest-ink'], t.zest, 4.5],
    ['destructive text on the page', t.clay, t.bg, 4.5],
    ['destructive text on a card', t.clay, t.surface, 4.5],
    // Not text: the button just has to be visibly a button.
    ['a primary button against the page', t.moss, t.bg, 3],
  ];

  for (const [what, fg, bg, min] of pairs) {
    test(`${theme}: ${what} meets ${min}:1`, () => {
      assert.ok(fg, `missing token for "${what}"`);
      assert.ok(bg, `missing token for "${what}"`);
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= min, `${what} is ${ratio.toFixed(2)}:1 in ${theme} mode, needs ${min}:1`);
    });
  }
}

test('both themes define the same set of colour tokens', () => {
  assert.deepEqual(Object.keys(tokens(':root')).sort(), Object.keys(tokens('.dark')).sort());
});

/**
 * Muted text is dimmed with an alpha rather than given its own token, so none
 * of the pairs above could see it — and an audit found 116 contrast failures
 * hiding in exactly that gap. This pins the rule that came out of it:
 *
 *     alpha ink below 70% is for lines, not letters.
 *
 * Light mode is the binding case. At 60% the ink lands on 4.23:1 against the
 * page, which is close enough to look fine and still fail.
 */
const MUTED = 0.7;

/** Flattens `rgb(ink / a)` over an opaque background. */
function composite(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as [number, number, number];
}

for (const theme of ['light', 'dark'] as const) {
  const t = tokens(theme === 'light' ? ':root' : '.dark');
  for (const [surface, bg] of [
    ['the page', t.bg],
    ['a card', t.surface],
  ] as const) {
    test(`${theme}: muted text on ${surface} clears 4.5:1`, () => {
      const ratio = contrast(composite(t.ink, bg, MUTED), bg);
      assert.ok(
        ratio >= 4.5,
        `ink at ${MUTED * 100}% is ${ratio.toFixed(2)}:1 on ${surface} in ${theme} mode`,
      );
    });
  }
}

test('the muted level is the lowest one that actually passes', () => {
  // Guards against quietly loosening MUTED: the step below it must fail, or
  // the constant has drifted away from being a considered minimum.
  const t = tokens(':root');
  const weaker = contrast(composite(t.ink, t.bg, MUTED - 0.1), t.bg);
  assert.ok(weaker < 4.5, `ink at ${(MUTED - 0.1) * 100}% now passes — MUTED can come down`);
});

test('no text colour is dimmed below the AA floor', () => {
  // 0.7 is where this palette stops meeting 4.5:1 — the finding behind the
  // 116 contrast failures earlier in this project. A `/60` on a paragraph is a
  // one-character change that reads as a stylistic choice and is actually a
  // WCAG failure, and the e2e axe run only visits a page in one state, so it
  // can miss a surface that needs seeding to appear.
  //
  // Icons are exempt: they carry no text and axe doesn't measure them.
  const ICON_ONLY = new Set(['src/components/MealPlanView.tsx', 'src/components/StarRating.tsx']);
  const offenders: string[] = [];

  for (const file of sourceFiles('src')) {
    if (ICON_ONLY.has(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const [match, alpha] of text.matchAll(/text-(?:charcoal|ink|stock)\/(\d+)/g)) {
      if (Number(alpha) < 70) offenders.push(`${file}: ${match}`);
    }
  }
  assert.deepEqual(offenders, []);
});

/**
 * The PWA chrome — the browser's address-bar tint and the installed app's
 * splash background — is written as a hex string in two files outside the
 * stylesheet, so nothing keeps it honest but this.
 *
 * It has already drifted once. Before the repalette (#73) all four values were
 * `#FAF7F2`, exactly matching `--color-bg: 250 247 242`. That commit moved the
 * token to bone and set the chrome to `#F2F0E8` — which is the bone used in the
 * *icon artwork*, not the page. The dark half was updated correctly, so the
 * mismatch was light-only: the splash and address bar sat one shade lighter
 * than the app behind them, which reads as a seam on launch.
 */
const hex = ([r, g, b]: [number, number, number]) =>
  '#' +
  [r, g, b]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

test('the PWA chrome colours match the page background in both themes', () => {
  const light = hex(tokens(':root')['bg']);
  const dark = hex(tokens('.dark')['bg']);

  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
  const themeColors = [
    ...layout.matchAll(/prefers-color-scheme:\s*(light|dark)\)',\s*color:\s*'(#[0-9A-Fa-f]{6})'/g),
  ];
  assert.equal(themeColors.length, 2, 'expected a light and a dark themeColor in layout.tsx');
  for (const [, scheme, value] of themeColors) {
    const expected = scheme === 'light' ? light : dark;
    assert.equal(
      value.toUpperCase(),
      expected,
      `layout.tsx themeColor (${scheme}) should be --color-bg`,
    );
  }

  const manifest = JSON.parse(
    readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'),
  );
  // The manifest has no dark variant, so both of its colours track the light bg.
  assert.equal(
    manifest.theme_color.toUpperCase(),
    light,
    'manifest theme_color should be --color-bg',
  );
  assert.equal(
    manifest.background_color.toUpperCase(),
    light,
    'manifest background_color should be --color-bg',
  );
});
