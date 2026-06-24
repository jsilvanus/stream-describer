import { FfmpegFrameSource } from './ffmpegFrameSource.js';

/** Extracts frames from a live stream at a fixed interval via ffmpeg. */
export class FrameExtractor extends FfmpegFrameSource {
  constructor({ streamUrl, frameInterval, width, height, reconnectMax = 0 }) {
    super({ streamUrl, reconnectMax, logLabel: 'frame extractor' });
    this.frameInterval = frameInterval;
    this.width = width;
    this.height = height;
  }

  buildArgs() {
    const fps = `fps=1/${this.frameInterval},scale=${this.width}:${this.height}`;
    return [
      '-i', this.streamUrl,
      '-vf', fps,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ];
  }
}
