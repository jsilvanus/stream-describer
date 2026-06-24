import { FfmpegFrameSource } from './ffmpegFrameSource.js';

/**
 * Emits a frame on detected scene changes, via ffmpeg's scene filter.
 * Frame-rate limiting (MIN_FRAME_INTERVAL) is enforced by FrameBroker.
 */
export class MotionDetector extends FfmpegFrameSource {
  constructor({ streamUrl, threshold, width, height, reconnectMax = 0 }) {
    super({ streamUrl, reconnectMax, logLabel: 'motion detector' });
    this.threshold = threshold;
    this.width = width;
    this.height = height;
  }

  buildArgs() {
    const vf = `select='gt(scene,${this.threshold})',scale=${this.width}:${this.height}`;
    return [
      '-i', this.streamUrl,
      '-vf', vf,
      '-vsync', 'vfr',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ];
  }
}
