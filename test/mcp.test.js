import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.js';
import { StateHistory } from '../src/stateHistory.js';
import { PromptLoader } from '../src/promptLoader.js';
import { InferenceEngine } from '../src/inferenceEngine.js';
import { FrameBroker } from '../src/frameBroker.js';

async function setup({ captureSnapshot } = {}) {
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
  const ollama = { chat: async () => ({ content: '{"description":"a"}', latencyMs: 7 }) };
  const inferenceEngine = new InferenceEngine({ ollama, promptLoader, stateHistory });
  const frameBroker = new FrameBroker(config);

  const server = createMcpServer({
    config,
    stateHistory,
    promptLoader,
    inferenceEngine,
    frameBroker,
    ...(captureSnapshot ? { captureSnapshot } : {}),
  });
  const client = new Client({ name: 'test-client', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server, stateHistory, inferenceEngine, frameBroker, promptLoader };
}

test('status tool reports trigger mode and model', async () => {
  const { client } = await setup();
  const result = await client.callTool({ name: 'status', arguments: {} });
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.triggerMode, 'fps');
  assert.equal(data.ollamaModel, 'test-model');
});

test('describe returns latest state after a frame is processed', async () => {
  const { client, inferenceEngine } = await setup();
  await inferenceEngine.processFrame(Buffer.from('x'), 'b64');
  const result = await client.callTool({ name: 'describe', arguments: {} });
  const data = JSON.parse(result.content[0].text);
  assert.deepEqual(data.state, { description: 'a' });
  assert.equal(data.changed, true);
});

test('get_history returns pushed states', async () => {
  const { client, stateHistory } = await setup();
  stateHistory.push({ a: 1 });
  stateHistory.push({ a: 2 });
  const result = await client.callTool({ name: 'get_history', arguments: { n: 1 } });
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.length, 1);
  assert.deepEqual(data[0].state, { a: 2 });
});

test('describe_now captures a frame and returns the inferred state', async () => {
  const captureSnapshot = async () => Buffer.from('frame-bytes');
  const { client, stateHistory } = await setup({ captureSnapshot });
  const result = await client.callTool({ name: 'describe_now', arguments: {} });
  const data = JSON.parse(result.content[0].text);
  assert.deepEqual(data.current, { description: 'a' });
  assert.equal(stateHistory.getLatest().state.description, 'a');
});

test('describe_now returns an error when snapshot capture fails', async () => {
  const captureSnapshot = async () => {
    throw new Error('ffmpeg exploded');
  };
  const { client } = await setup({ captureSnapshot });
  const result = await client.callTool({ name: 'describe_now', arguments: {} });
  const data = JSON.parse(result.content[0].text);
  assert.equal(result.isError, true);
  assert.equal(data.error, 'snapshot_failed');
});

test('restart clears history and reloads inline prompt', async () => {
  const { client, stateHistory, promptLoader } = await setup();
  stateHistory.push({ a: 1 });
  await client.callTool({
    name: 'restart',
    arguments: { systemPromptContent: 'new prompt' },
  });
  assert.equal(stateHistory.getLatest(), null);
  assert.equal(promptLoader.get(), 'new prompt');
});
