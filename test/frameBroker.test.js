import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameBroker } from '../src/frameBroker.js';

const baseConfig = {
  STREAM_URL: 'rtsp://example.invalid/stream',
  FRAME_WIDTH: 320,
  FRAME_HEIGHT: 180,
  STREAM_RECONNECT_MAX: 0,
  FRAME_INTERVAL: 2,
  MIN_FRAME_INTERVAL: 1,
  SCENE_CHANGE_THRESHOLD: 0.3,
};

test('fps mode only creates a FrameExtractor', () => {
  const broker = new FrameBroker({ ...baseConfig, TRIGGER_MODE: 'fps' });
  assert.ok(broker.fpsExtractor);
  assert.ok(!broker.motionDetector);
  assert.equal(broker.sources.length, 1);
});

test('motion mode only creates a MotionDetector', () => {
  const broker = new FrameBroker({ ...baseConfig, TRIGGER_MODE: 'motion' });
  assert.ok(!broker.fpsExtractor);
  assert.ok(broker.motionDetector);
  assert.equal(broker.sources.length, 1);
});

test('both mode creates both sources and dedupes by minFrameInterval', () => {
  const broker = new FrameBroker({ ...baseConfig, TRIGGER_MODE: 'both' });
  assert.equal(broker.sources.length, 2);

  const received = [];
  broker.onFrame((buf) => received.push(buf));

  broker.fpsExtractor.emit('frame', Buffer.from('a'));
  broker.motionDetector.emit('frame', Buffer.from('b')); // within dedupe window, dropped

  assert.equal(received.length, 1);
});
