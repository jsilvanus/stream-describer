export function jpegBufferToBase64(buffer) {
  return buffer.toString('base64');
}

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const EMPTY_BUFFER = Buffer.alloc(0);

/**
 * Splits a raw byte stream (e.g. ffmpeg image2pipe mjpeg output) into
 * individual JPEG frame buffers, delimited by SOI/EOI markers.
 * @param {NodeJS.ReadableStream} stream
 * @param {(frame: Buffer) => void} onFrame
 */
export function splitMjpegStream(stream, onFrame) {
  let buffer = EMPTY_BUFFER;

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    for (;;) {
      const start = buffer.indexOf(JPEG_SOI);
      if (start === -1) {
        buffer = EMPTY_BUFFER;
        break;
      }
      const end = buffer.indexOf(JPEG_EOI, start + JPEG_SOI.length);
      if (end === -1) {
        if (start > 0) buffer = buffer.subarray(start);
        break;
      }
      const frameEnd = end + JPEG_EOI.length;
      onFrame(buffer.subarray(start, frameEnd));
      buffer = buffer.subarray(frameEnd);
    }
  });
}
