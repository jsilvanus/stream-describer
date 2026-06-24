import { FrameExtractor } from './frameExtractor.js';
import { MotionDetector } from './motionDetector.js';

/**
 * Selects frame source(s) based on TRIGGER_MODE and exposes a single
 * onFrame(callback) interface. Frames are deduplicated by MIN_FRAME_INTERVAL
 * whenever a MotionDetector is active ('motion' or 'both' modes), since
 * scene-change events can otherwise fire arbitrarily fast.
 */
export class FrameBroker {
  constructor(config) {
    this.config = config;
    this.lastEmitAt = 0;
    this.sources = [];

    const common = {
      streamUrl: config.STREAM_URL,
      width: config.FRAME_WIDTH,
      height: config.FRAME_HEIGHT,
      reconnectMax: config.STREAM_RECONNECT_MAX,
    };

    if (config.TRIGGER_MODE === 'fps' || config.TRIGGER_MODE === 'both') {
      this.fpsExtractor = new FrameExtractor({
        ...common,
        frameInterval: config.FRAME_INTERVAL,
      });
      this.sources.push(this.fpsExtractor);
    }

    if (config.TRIGGER_MODE === 'motion' || config.TRIGGER_MODE === 'both') {
      this.motionDetector = new MotionDetector({
        ...common,
        threshold: config.SCENE_CHANGE_THRESHOLD,
      });
      this.sources.push(this.motionDetector);
    }
  }

  onFrame(callback) {
    const dedupeMs = this.config.MIN_FRAME_INTERVAL * 1000;
    const needsDedupe = this.config.TRIGGER_MODE === 'motion' || this.config.TRIGGER_MODE === 'both';
    for (const source of this.sources) {
      source.on('frame', (buffer) => {
        const now = Date.now();
        if (needsDedupe && now - this.lastEmitAt < dedupeMs) {
          return;
        }
        this.lastEmitAt = now;
        callback(buffer);
      });
    }
  }

  onStatus(callback) {
    for (const source of this.sources) {
      source.on('status', callback);
    }
  }

  isConnected() {
    return this.sources.some((s) => s.connected);
  }

  getStatus() {
    return this.sources.map((s) => s.getStatus());
  }

  start() {
    for (const source of this.sources) source.start();
  }

  stop() {
    for (const source of this.sources) source.stop();
  }
}
