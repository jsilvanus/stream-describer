import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { splitMjpegStream } from './utils.js';
import { logger } from './logger.js';

const MAX_BACKOFF_MS = 30_000;

/**
 * Base class for ffmpeg-backed frame sources. Owns the process lifecycle,
 * reconnect/backoff state machine, and status reporting. Subclasses supply
 * `buildArgs()` to control what ffmpeg extracts.
 *
 * Emits 'frame' (Buffer) and 'status' ({ connected: boolean }) events.
 */
export class FfmpegFrameSource extends EventEmitter {
  constructor({ streamUrl, reconnectMax = 0, logLabel }) {
    super();
    this.streamUrl = streamUrl;
    this.reconnectMax = reconnectMax;
    this.logLabel = logLabel;
    this.proc = null;
    this.reconnectAttempts = 0;
    // idle -> connected -> reconnecting -> (connected | exhausted); stopped from any state.
    this.state = 'idle';
  }

  get connected() {
    return this.state === 'connected';
  }

  getStatus() {
    return {
      connected: this.state === 'connected',
      reconnecting: this.state === 'reconnecting',
      reconnectAttempts: this.reconnectAttempts,
      exhausted: this.state === 'exhausted',
    };
  }

  /** Subclasses must return the ffmpeg argv array. */
  buildArgs() {
    throw new Error('buildArgs() must be implemented by subclass');
  }

  start() {
    this.state = 'idle';
    this._spawn();
  }

  _spawn() {
    if (this.state === 'stopped') return;
    logger.info({ streamUrl: this.streamUrl }, `${this.logLabel}: starting ffmpeg`);
    this.proc = spawn('ffmpeg', this.buildArgs(), { stdio: ['ignore', 'pipe', 'pipe'] });

    splitMjpegStream(this.proc.stdout, (frame) => {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this.emit('frame', frame);
    });

    this.proc.stderr.on('data', () => {});

    this.proc.on('error', (err) => {
      logger.error({ err }, `${this.logLabel}: ffmpeg process error`);
    });

    this.proc.on('exit', (code) => {
      this.emit('status', { connected: false });
      if (this.state === 'stopped') return;
      logger.warn({ code }, `${this.logLabel}: ffmpeg exited, reconnecting`);
      this.state = 'reconnecting';
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectMax > 0 && this.reconnectAttempts >= this.reconnectMax) {
      this.state = 'exhausted';
      logger.error({ attempts: this.reconnectAttempts }, `${this.logLabel}: max reconnect attempts reached`);
      this.emit('reconnectExhausted');
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_BACKOFF_MS);
    setTimeout(() => this._spawn(), delay);
  }

  stop() {
    this.state = 'stopped';
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}
