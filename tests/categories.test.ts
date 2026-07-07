import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize } from '../src/lib/categories.ts';

test('produce basics', () => {
  assert.equal(categorize('onion'), 'Produce');
  assert.equal(categorize('cherry tomato'), 'Produce');
  assert.equal(categorize('carrots'), 'Produce');
});

test('specific beats generic: bell pepper is produce, black pepper is spice', () => {
  assert.equal(categorize('bell pepper'), 'Produce');
  assert.equal(categorize('black pepper'), 'Spices & Seasonings');
  assert.equal(categorize('pepper'), 'Spices & Seasonings');
});

test('coconut milk is pantry, milk is dairy', () => {
  assert.equal(categorize('coconut milk'), 'Pantry');
  assert.equal(categorize('milk'), 'Dairy & Eggs');
});

test('meat and seafood', () => {
  assert.equal(categorize('chicken breast'), 'Meat & Seafood');
  assert.equal(categorize('ground beef'), 'Meat & Seafood');
  assert.equal(categorize('shrimp'), 'Meat & Seafood');
});

test('word boundaries: butternut squash is not butter', () => {
  assert.equal(categorize('butternut squash'), 'Produce');
});

test('frozen wins as a marker word', () => {
  assert.equal(categorize('frozen peas'), 'Frozen');
});

test('unknown falls back to Other', () => {
  assert.equal(categorize('xyzzy essence'), 'Other');
});
