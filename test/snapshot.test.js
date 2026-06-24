import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { captureSnapshot } from '../src/snapshot.js';

function fakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = () => {};
  return proc;
}

test('captureSnapshot resolves with the first frame written to stdout', async () => {
  const proc = fakeProc();
  const spawnFn = () => proc;

  const promise = captureSnapshot({ streamUrl: 'rtsp://x', width: 320, height: 180, spawnFn });

  const frame = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('AAA'), Buffer.from([0xff, 0xd9])]);
  proc.stdout.write(frame);

  const result = await promise;
  assert.deepEqual(result, frame);
});

test('captureSnapshot rejects when ffmpeg exits before producing a frame', async () => {
  const proc = fakeProc();
  const spawnFn = () => proc;

  const promise = captureSnapshot({ streamUrl: 'rtsp://x', width: 320, height: 180, spawnFn });
  proc.emit('exit', 1);

  await assert.rejects(promise, /ffmpeg exited with code 1/);
});

test('captureSnapshot rejects on process error', async () => {
  const proc = fakeProc();
  const spawnFn = () => proc;

  const promise = captureSnapshot({ streamUrl: 'rtsp://x', width: 320, height: 180, spawnFn });
  proc.emit('error', new Error('spawn failed'));

  await assert.rejects(promise, /spawn failed/);
});

test('captureSnapshot rejects on timeout', async () => {
  const proc = fakeProc();
  const spawnFn = () => proc;

  await assert.rejects(
    captureSnapshot({ streamUrl: 'rtsp://x', width: 320, height: 180, timeoutMs: 10, spawnFn }),
    /timed out/
  );
});
