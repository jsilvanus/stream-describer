import { readFile, watch } from 'node:fs/promises';
import { logger } from './logger.js';

export class PromptLoader {
  constructor(initialPath) {
    this.path = initialPath;
    this.content = '';
    this._watchAbort = null;
  }

  async load(path = this.path) {
    this.content = await readFile(path, 'utf-8');
    this.path = path;
    return this.content;
  }

  /**
   * Replaces the active prompt, either from a new file path or inline content.
   * @param {{ systemPromptPath?: string, systemPromptContent?: string }} opts
   */
  async reload({ systemPromptPath, systemPromptContent } = {}) {
    this._stopWatching();
    if (systemPromptContent != null) {
      this.content = systemPromptContent;
      return this.content;
    }
    return this.load(systemPromptPath || this.path);
  }

  get() {
    return this.content;
  }

  /** Watches the current prompt file for changes and reloads automatically. */
  async watchForChanges() {
    this._stopWatching();
    this._watchAbort = new AbortController();
    try {
      const watcher = watch(this.path, { signal: this._watchAbort.signal });
      for await (const event of watcher) {
        if (event.eventType === 'change') {
          try {
            await this.load(this.path);
            logger.info({ path: this.path }, 'system prompt reloaded after file change');
          } catch (err) {
            logger.error({ err, path: this.path }, 'failed to reload system prompt after file change');
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        logger.warn({ err, path: this.path }, 'system prompt file watch ended');
      }
    }
  }

  _stopWatching() {
    if (this._watchAbort) {
      this._watchAbort.abort();
      this._watchAbort = null;
    }
  }
}
