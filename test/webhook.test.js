import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setupWebhook } from '../src/webhook.js';

function fakeEngine() {
  return new EventEmitter();
}

test('on_change mode only fires when changed=true', async () => {
  const engine = fakeEngine();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true };
  };
  setupWebhook({
    inferenceEngine: engine,
    config: { WEBHOOK_URL: 'http://example.invalid/hook', WEBHOOK_MODE: 'on_change' },
    fetchImpl,
  });

  engine.emit('stateChange', { changed: false, current: {}, previous: {}, timestamp: 't1' });
  engine.emit('stateChange', { changed: true, current: {}, previous: {}, timestamp: 't2' });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].opts.body).timestamp, 't2');
});

test('always mode fires on every event', async () => {
  const engine = fakeEngine();
  const calls = [];
  const fetchImpl = async () => {
    calls.push(1);
    return { ok: true };
  };
  setupWebhook({
    inferenceEngine: engine,
    config: { WEBHOOK_URL: 'http://example.invalid/hook', WEBHOOK_MODE: 'always' },
    fetchImpl,
  });

  engine.emit('stateChange', { changed: false, current: {}, previous: {}, timestamp: 't1' });
  engine.emit('stateChange', { changed: false, current: {}, previous: {}, timestamp: 't2' });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.length, 2);
});

test('sets bearer auth header when token configured', async () => {
  const engine = fakeEngine();
  let seenHeaders;
  const fetchImpl = async (url, opts) => {
    seenHeaders = opts.headers;
    return { ok: true };
  };
  setupWebhook({
    inferenceEngine: engine,
    config: {
      WEBHOOK_URL: 'http://example.invalid/hook',
      WEBHOOK_MODE: 'always',
      WEBHOOK_TOKEN: 'secret123',
    },
    fetchImpl,
  });

  engine.emit('stateChange', { changed: true, current: {}, previous: {}, timestamp: 't1' });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(seenHeaders.Authorization, 'Bearer secret123');
});

test('retries once then gives up without throwing', async () => {
  const engine = fakeEngine();
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return { ok: false, status: 500 };
  };
  setupWebhook({
    inferenceEngine: engine,
    config: { WEBHOOK_URL: 'http://example.invalid/hook', WEBHOOK_MODE: 'always' },
    fetchImpl,
  });

  engine.emit('stateChange', { changed: true, current: {}, previous: {}, timestamp: 't1' });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(attempts, 2);
});

test('returns null and does nothing when WEBHOOK_URL not set', () => {
  const engine = fakeEngine();
  const result = setupWebhook({ inferenceEngine: engine, config: {} });
  assert.equal(result, null);
});
