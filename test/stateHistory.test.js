import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StateHistory } from '../src/stateHistory.js';

test('caps state entries at historyDepth', () => {
  const h = new StateHistory({ historyDepth: 2, historyImages: 0 });
  h.push({ a: 1 });
  h.push({ a: 2 });
  h.push({ a: 3 });
  const hist = h.getHistory();
  assert.equal(hist.length, 2);
  assert.deepEqual(hist.map((e) => e.state), [{ a: 2 }, { a: 3 }]);
});

test('caps image buffer at historyImages and ignores when 0', () => {
  const h = new StateHistory({ historyDepth: 10, historyImages: 1 });
  h.push({ a: 1 }, 'img1');
  h.push({ a: 2 }, 'img2');
  assert.deepEqual(h.getImages(), ['img2']);

  const h2 = new StateHistory({ historyDepth: 10, historyImages: 0 });
  h2.push({ a: 1 }, 'img1');
  assert.deepEqual(h2.getImages(), []);
});

test('getLatest and clear', () => {
  const h = new StateHistory({ historyDepth: 5, historyImages: 0 });
  assert.equal(h.getLatest(), null);
  h.push({ a: 1 });
  assert.deepEqual(h.getLatest().state, { a: 1 });
  h.clear();
  assert.equal(h.getLatest(), null);
  assert.equal(h.getHistory().length, 0);
});
