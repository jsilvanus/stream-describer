export class OllamaClient {
  constructor({ baseUrl, model }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async verifyReachable() {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama not reachable at ${this.baseUrl}: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * @param {object} opts
   * @param {string} opts.systemPrompt
   * @param {string} opts.userContent - text content for the user message
   * @param {string[]} opts.images - base64-encoded JPEG images (no data: prefix)
   */
  async chat({ systemPrompt, userContent, images = [] }) {
    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent, images },
        ],
      }),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama chat failed: HTTP ${res.status} ${text}`);
    }
    const data = await res.json();
    return { content: data.message?.content ?? '', latencyMs };
  }

  async destroy() {}
}

export { smokeTest } from './visionSmokeTest.js';
