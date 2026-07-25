import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  const block = CSS.slice(start, CSS.indexOf('\n}', start));
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
