import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STREAM_URL = process.env.STREAM_URL || 'rtsp://test.invalid/stream';
const { loadConfig } = await import('../src/config.js');

test('requires STREAM_URL', () => {
  assert.throws(() => loadConfig({}));
});

test('applies defaults', () => {
  const cfg = loadConfig({ STREAM_URL: 'rtsp://example.com/stream' });
  assert.equal(cfg.OLLAMA_URL, 'http://ollama:11434');
  assert.equal(cfg.OLLAMA_MODEL, 'qwen3-vl:8b');
  assert.equal(cfg.TRIGGER_MODE, 'fps');
  assert.equal(cfg.FRAME_INTERVAL, 2);
  assert.equal(cfg.MCP_PORT, 3100);
});

test('rejects invalid TRIGGER_MODE', () => {
  assert.throws(() =>
    loadConfig({ STREAM_URL: 'rtsp://x', TRIGGER_MODE: 'bogus' })
  );
});
