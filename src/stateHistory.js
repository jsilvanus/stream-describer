/**
 * Maintains a bounded history of inferred JSON scene states and, separately,
 * a bounded buffer of recent frame images for multi-image context.
 */
export class StateHistory {
  constructor({ historyDepth, historyImages = 0 }) {
    this.historyDepth = historyDepth;
    this.historyImages = historyImages;
    this.states = [];
    this.images = [];
  }

  push(state, imageB64) {
    this.states.push({ timestamp: new Date().toISOString(), state });
    if (this.states.length > this.historyDepth) {
      this.states.shift();
    }

    if (this.historyImages > 0 && imageB64) {
      this.images.push(imageB64);
      if (this.images.length > this.historyImages) {
        this.images.shift();
      }
    }
  }

  getHistory(n = this.historyDepth) {
    return this.states.slice(-n);
  }

  getImages() {
    return this.images;
  }

  getLatest() {
    return this.states[this.states.length - 1] ?? null;
  }

  clear() {
    this.states = [];
    this.images = [];
  }
}
