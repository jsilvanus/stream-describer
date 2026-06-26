import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeedeerClient } from '../src/seedeer.js';

function fakeVqa(askImpl) {
  return { ask: askImpl, destroy: async () => {} };
}

test('chat() decodes the last base64 image and forwards systemPrompt+userContent as the question', async () => {
  let received;
  const vqa = fakeVqa(async (image, question) => {
    received = { image, question };
    return '{"description":"a"}';
  });
  const client = new SeedeerClient(vqa, 'test-model');

  const result = await client.chat({
    systemPrompt: 'sys',
    userContent: 'user',
    images: ['aGlzdG9yeQ==', 'Y3VycmVudA=='],
  });

  assert.equal(result.content, '{"description":"a"}');
  assert.equal(typeof result.latencyMs, 'number');
  assert.deepEqual(received.image, Buffer.from('Y3VycmVudA==', 'base64'));
  assert.equal(received.question, 'sys\n\nuser');
});

test('chat() throws when no images are provided', async () => {
  const client = new SeedeerClient(fakeVqa(async () => ''), 'test-model');
  await assert.rejects(() => client.chat({ systemPrompt: 'sys', userContent: 'user', images: [] }));
});

test('destroy() delegates to the underlying VqaAssistant', async () => {
  let destroyed = false;
  const vqa = { ask: async () => '', destroy: async () => { destroyed = true; } };
  const client = new SeedeerClient(vqa, 'test-model');
  await client.destroy();
  assert.equal(destroyed, true);
});
