import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { splitMjpegStream, jpegBufferToBase64 } from '../src/utils.js';

test('jpegBufferToBase64 encodes a buffer', () => {
  const buf = Buffer.from([1, 2, 3]);
  assert.equal(jpegBufferToBase64(buf), buf.toString('base64'));
});

test('splitMjpegStream extracts individual frames split across chunks', () => {
  const frame1 = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('AAA'), Buffer.from([0xff, 0xd9])]);
  const frame2 = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('BBB'), Buffer.from([0xff, 0xd9])]);
  const combined = Buffer.concat([frame1, frame2]);

  const stream = new PassThrough();
  const frames = [];
  splitMjpegStream(stream, (f) => frames.push(Buffer.from(f)));

  // Write in arbitrary chunk boundaries, including mid-frame splits.
  stream.write(combined.subarray(0, 5));
  stream.write(combined.subarray(5, 9));
  stream.write(combined.subarray(9));
  stream.end();

  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0], frame1);
  assert.deepEqual(frames[1], frame2);
});
