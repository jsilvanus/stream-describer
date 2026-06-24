import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InferenceEngine } from '../src/inferenceEngine.js';
import { StateHistory } from '../src/stateHistory.js';
import { PromptLoader } from '../src/promptLoader.js';
import { FrameBroker } from '../src/frameBroker.js';

function fakePromptLoader() {
  const loader = new PromptLoader('unused');
  loader.content = 'system prompt';
  return loader;
}

test('drain resolves immediately when nothing in flight', async () => {
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const engine = new InferenceEngine({
    ollama: { chat: async () => ({ content: '{}', latencyMs: 1 }) },
    promptLoader: fakePromptLoader(),
    stateHistory,
  });
  await engine.drain();
  assert.equal(engine.inFlight, 0);
});

test('drain waits for in-flight inference to finish', async () => {
  let resolveChat;
  const ollama = {
    chat: () =>
      new Promise((resolve) => {
        resolveChat = () => resolve({ content: '{}', latencyMs: 1 });
      }),
  };
  const stateHistory = new StateHistory({ historyDepth: 5, historyImages: 0 });
  const engine = new InferenceEngine({ ollama, promptLoader: fakePromptLoader(), stateHistory });

  const framePromise = engine.processFrame(Buffer.from('x'), 'a');
  assert.equal(engine.inFlight, 1);

  let drained = false;
  const drainPromise = engine.drain(5).then(() => (drained = true));

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(drained, false);

  resolveChat();
  await framePromise;
  await drainPromise;
  assert.equal(drained, true);
  assert.equal(engine.inFlight, 0);
});

test('frameBroker.getStatus reflects each source connection state', () => {
  const broker = new FrameBroker({
    STREAM_URL: 'rtsp://x',
    TRIGGER_MODE: 'fps',
    FRAME_WIDTH: 320,
    FRAME_HEIGHT: 180,
    FRAME_INTERVAL: 2,
    MIN_FRAME_INTERVAL: 1,
    SCENE_CHANGE_THRESHOLD: 0.3,
    STREAM_RECONNECT_MAX: 0,
  });
  const status = broker.getStatus();
  assert.equal(status.length, 1);
  assert.equal(status[0].connected, false);
  assert.equal(status[0].reconnecting, false);
  assert.equal(status[0].exhausted, false);
});
