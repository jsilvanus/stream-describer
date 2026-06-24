import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InferenceEngine } from '../src/inferenceEngine.js';
import { StateHistory } from '../src/stateHistory.js';
import { PromptLoader } from '../src/promptLoader.js';

function fakePromptLoader(content = 'system prompt') {
  const loader = new PromptLoader('unused');
  loader.content = content;
  return loader;
}

test('parses valid JSON response and marks first frame as changed', async () => {
  const ollama = { chat: async () => ({ content: '{"description":"a"}', latencyMs: 42 }) };
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const engine = new InferenceEngine({ ollama, promptLoader: fakePromptLoader(), stateHistory });

  let emitted;
  engine.on('stateChange', (e) => (emitted = e));

  const result = await engine.processFrame(Buffer.from('x'), 'base64x');
  assert.equal(result.changed, true);
  assert.deepEqual(result.current, { description: 'a' });
  assert.equal(result.previous, null);
  assert.equal(emitted.changed, true);
  assert.equal(engine.lastLatencyMs, 42);
});

test('detects no-change between identical consecutive states', async () => {
  let call = 0;
  const ollama = {
    chat: async () => {
      call += 1;
      return { content: '{"description":"same"}', latencyMs: 10 };
    },
  };
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const engine = new InferenceEngine({ ollama, promptLoader: fakePromptLoader(), stateHistory });

  await engine.processFrame(Buffer.from('x'), 'a');
  const second = await engine.processFrame(Buffer.from('y'), 'b');

  assert.equal(call, 2);
  assert.equal(second.changed, false);
});

test('falls back to raw text when response is not valid JSON', async () => {
  const ollama = { chat: async () => ({ content: 'not json', latencyMs: 5 }) };
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const engine = new InferenceEngine({ ollama, promptLoader: fakePromptLoader(), stateHistory });

  const result = await engine.processFrame(Buffer.from('x'), 'a');
  assert.deepEqual(result.current, { raw: 'not json' });
});

test('skips history push and emits inferenceError on ollama failure', async () => {
  const ollama = { chat: async () => { throw new Error('boom'); } };
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const engine = new InferenceEngine({ ollama, promptLoader: fakePromptLoader(), stateHistory });

  let errored = false;
  engine.on('inferenceError', () => (errored = true));

  const result = await engine.processFrame(Buffer.from('x'), 'a');
  assert.equal(result, null);
  assert.equal(errored, true);
  assert.equal(stateHistory.getLatest(), null);
});
