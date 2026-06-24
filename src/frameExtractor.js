import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { splitMjpegStream } from './utils.js';
import { logger } from './logger.js';

const MAX_BACKOFF_MS = 30_000;

/**
 * Extracts frames from a live stream at a fixed interval via ffmpeg.
 * Emits 'frame' (Buffer) and 'status' ({ connected: boolean }) events.
 */
export class FrameExtractor extends EventEmitter {
  constructor({ streamUrl, frameInterval, width, height, reconnectMax = 0 }) {
    super();
    this.streamUrl = streamUrl;
    this.frameInterval = frameInterval;
    this.width = width;
    this.height = height;
    this.reconnectMax = reconnectMax;
    this.proc = null;
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.connected = false;
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

  start() {
    this.stopped = false;
    this._spawn();
  }

  _spawn() {
    if (this.stopped) return;
    logger.info({ streamUrl: this.streamUrl }, 'frame extractor: starting ffmpeg');
    this.proc = spawn('ffmpeg', this.buildArgs(), { stdio: ['ignore', 'pipe', 'pipe'] });

    splitMjpegStream(this.proc.stdout, (frame) => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('frame', frame);
    });

    this.proc.stderr.on('data', () => {});

    this.proc.on('error', (err) => {
      logger.error({ err }, 'frame extractor: ffmpeg process error');
    });

    this.proc.on('exit', (code) => {
      this.connected = false;
      this.emit('status', { connected: false });
      if (this.stopped) return;
      logger.warn({ code }, 'frame extractor: ffmpeg exited, reconnecting');
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectMax > 0 && this.reconnectAttempts >= this.reconnectMax) {
      logger.error({ attempts: this.reconnectAttempts }, 'frame extractor: max reconnect attempts reached');
      this.emit('reconnectExhausted');
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_BACKOFF_MS);
    setTimeout(() => this._spawn(), delay);
  }

  stop() {
    this.stopped = true;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}
