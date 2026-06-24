import { EventEmitter } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { logger } from './logger.js';

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Drives per-frame inference: assembles prompt context (system prompt, prior
 * states, optional prior images, current frame), calls Ollama, parses the
 * response, and updates state history. Emits 'stateChange' on every result.
 */
export class InferenceEngine extends EventEmitter {
  constructor({ ollama, promptLoader, stateHistory }) {
    super();
    this.ollama = ollama;
    this.promptLoader = promptLoader;
    this.stateHistory = stateHistory;
    this.lastFrameAt = null;
    this.lastInferenceAt = null;
    this.lastLatencyMs = null;
    this.lastChanged = null;
    this.inFlight = 0;
  }

  buildUserContent(frameB64) {
    const history = this.stateHistory.getHistory();
    const payload = {
      previousStates: history,
      instruction:
        'Describe the current scene state. Respond only in the JSON format defined in the system prompt.',
    };
    return JSON.stringify(payload);
  }

  async processFrame(frameBuffer, frameB64) {
    this.inFlight += 1;
    try {
      this.lastFrameAt = new Date().toISOString();

      const systemPrompt = this.promptLoader.get();
      const priorImages = this.stateHistory.getImages();
      const userContent = this.buildUserContent(frameB64);

      let result;
      try {
        result = await this.ollama.chat({
          systemPrompt,
          userContent,
          images: priorImages.concat(frameB64),
        });
      } catch (err) {
        logger.warn({ err }, 'inference call failed, skipping frame');
        this.emit('inferenceError', err);
        return null;
      }

      this.lastInferenceAt = new Date().toISOString();
      this.lastLatencyMs = result.latencyMs;

      const current = tryParseJson(result.content);
      const previousEntry = this.stateHistory.getLatest();
      const previous = previousEntry ? previousEntry.state : null;
      const changed = previous == null ? true : !isDeepStrictEqual(previous, current);

      this.stateHistory.push(current, frameB64);
      this.lastChanged = changed;

      const event = { previous, current, timestamp: this.lastInferenceAt, changed };
      this.emit('stateChange', event);
      return event;
    } finally {
      this.inFlight -= 1;
    }
  }

  /** Waits for all in-flight inference calls to complete, polling at the given interval. */
  async drain(pollMs = 50) {
    while (this.inFlight > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
