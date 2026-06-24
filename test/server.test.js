import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { StateHistory } from '../src/stateHistory.js';
import { PromptLoader } from '../src/promptLoader.js';
import { InferenceEngine } from '../src/inferenceEngine.js';
import { FrameBroker } from '../src/frameBroker.js';

async function buildDeps() {
  const config = {
    HISTORY_DEPTH: 5,
    HISTORY_IMAGES: 0,
    TRIGGER_MODE: 'fps',
    OLLAMA_MODEL: 'test-model',
    STREAM_URL: 'rtsp://test.invalid',
    FRAME_WIDTH: 320,
    FRAME_HEIGHT: 180,
    FRAME_INTERVAL: 2,
    MIN_FRAME_INTERVAL: 1,
    SCENE_CHANGE_THRESHOLD: 0.3,
    STREAM_RECONNECT_MAX: 0,
  };
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const promptLoader = new PromptLoader('unused');
  promptLoader.content = 'system prompt';
  const ollama = { chat: async () => ({ content: '{"description":"ok"}', latencyMs: 1 }) };
  const inferenceEngine = new InferenceEngine({ ollama, promptLoader, stateHistory });
  const frameBroker = new FrameBroker(config);
  return { config, stateHistory, promptLoader, inferenceEngine, frameBroker };
}

test('GET /health returns ok over real HTTP', async () => {
  const deps = await buildDeps();
  const server = await createServer(deps);
  await server.ready();
  try {
    const res = await server.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.payload), { status: 'ok' });
  } finally {
    await server.close();
  }
});

test('POST /mcp handles a tools/call over the streamable HTTP transport', async () => {
  const deps = await buildDeps();
  const server = await createServer(deps);
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address();
  const url = `http://127.0.0.1:${address.port}/mcp`;

  try {
    const initRes = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    assert.equal(initRes.status, 200);
    const sessionId = initRes.headers.get('mcp-session-id');

    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const callRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'status', arguments: {} },
      }),
    });
    assert.equal(callRes.status, 200);
    const text = await callRes.text();
    assert.ok(text.includes('triggerMode'));
  } finally {
    await server.close();
  }
});
