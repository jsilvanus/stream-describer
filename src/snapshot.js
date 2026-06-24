import { spawn } from 'node:child_process';
import { splitMjpegStream } from './utils.js';

/**
 * Captures a single current frame from the stream via a one-shot ffmpeg
 * process, independent of the continuous fps/motion pipeline.
 */
export async function captureSnapshot({ streamUrl, width, height, timeoutMs = 10_000, spawnFn = spawn }) {
  return new Promise((resolve, reject) => {
    const proc = spawnFn(
      'ffmpeg',
      [
        '-i', streamUrl,
        '-vf', `scale=${width}:${height}`,
        '-frames:v', '1',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let settled = false;
    const timer = setTimeout(() => finish(reject, new Error('snapshot capture timed out')), timeoutMs);

    function finish(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill('SIGTERM');
      fn(arg);
    }

    splitMjpegStream(proc.stdout, (frame) => finish(resolve, frame));
    proc.stderr.on('data', () => {});
    proc.on('error', (err) => finish(reject, err));
    proc.on('exit', (code) => {
      if (!settled) finish(reject, new Error(`ffmpeg exited with code ${code} before producing a frame`));
    });
  });
}
