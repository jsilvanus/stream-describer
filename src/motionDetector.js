import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { splitMjpegStream } from './utils.js';
import { logger } from './logger.js';

const MAX_BACKOFF_MS = 30_000;

/**
 * Emits a frame only on detected scene changes, via ffmpeg's scene filter.
 * Enforces minFrameInterval client-side to avoid flooding on noisy scenes.
 */
export class MotionDetector extends EventEmitter {
  constructor({ streamUrl, threshold, width, height, minFrameInterval, reconnectMax = 0 }) {
    super();
    this.streamUrl = streamUrl;
    this.threshold = threshold;
    this.width = width;
    this.height = height;
    this.minFrameInterval = minFrameInterval;
    this.reconnectMax = reconnectMax;
    this.proc = null;
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.connected = false;
    this.exhausted = false;
    this.started = false;
    this.lastEmitAt = 0;
  }

  getStatus() {
    return {
      connected: this.connected,
      reconnecting: this.started && !this.connected && !this.stopped && !this.exhausted,
      reconnectAttempts: this.reconnectAttempts,
      exhausted: this.exhausted,
    };
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

  start() {
    this.stopped = false;
    this.started = true;
    this._spawn();
  }

  _spawn() {
    if (this.stopped) return;
    logger.info({ streamUrl: this.streamUrl }, 'motion detector: starting ffmpeg');
    this.proc = spawn('ffmpeg', this.buildArgs(), { stdio: ['ignore', 'pipe', 'pipe'] });

    splitMjpegStream(this.proc.stdout, (frame) => {
      this.connected = true;
      this.reconnectAttempts = 0;
      const now = Date.now();
      if (now - this.lastEmitAt < this.minFrameInterval * 1000) {
        return;
      }
      this.lastEmitAt = now;
      this.emit('frame', frame);
    });

    this.proc.stderr.on('data', () => {});

    this.proc.on('error', (err) => {
      logger.error({ err }, 'motion detector: ffmpeg process error');
    });

    this.proc.on('exit', (code) => {
      this.connected = false;
      this.emit('status', { connected: false });
      if (this.stopped) return;
      logger.warn({ code }, 'motion detector: ffmpeg exited, reconnecting');
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectMax > 0 && this.reconnectAttempts >= this.reconnectMax) {
      this.exhausted = true;
      logger.error({ attempts: this.reconnectAttempts }, 'motion detector: max reconnect attempts reached');
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
