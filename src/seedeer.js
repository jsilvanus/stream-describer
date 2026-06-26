import { VqaAssistant } from '@jsilvanus/seedeer';
import { logger } from './logger.js';

/**
 * Wraps seedeer's VqaAssistant behind the same `chat({systemPrompt, userContent,
 * images})` interface as OllamaClient, so InferenceEngine can use either
 * interchangeably. VQA only takes one image per call, so only the most recent
 * frame is sent; prior-frame context still arrives via `userContent`.
 */
export class SeedeerClient {
  constructor(vqa, model) {
    this.vqa = vqa;
    this.model = model;
  }

  static async create({ model, mode, device }) {
    const vqa = await VqaAssistant.create({ backend: 'local', model, mode, device });
    return new SeedeerClient(vqa, model);
  }

  async verifyReachable() {
    return { model: this.model };
  }

  /**
   * @param {object} opts
   * @param {string} opts.systemPrompt
   * @param {string} opts.userContent
   * @param {string[]} opts.images - base64-encoded JPEG images (no data: prefix)
   */
  async chat({ systemPrompt, userContent, images = [] }) {
    const start = Date.now();
    const lastImage = images[images.length - 1];
    if (!lastImage) {
      throw new Error('SeedeerClient.chat requires at least one image');
    }
    const frameBuffer = Buffer.from(lastImage, 'base64');
    const question = `${systemPrompt}\n\n${userContent}`;
    const content = await this.vqa.ask(frameBuffer, question);
    const latencyMs = Date.now() - start;
    return { content, latencyMs };
  }

  async destroy() {
    await this.vqa.destroy();
  }
}

export async function smokeTest(client, testImageB64) {
  logger.info({ model: client.model }, 'running seedeer smoke test');
  const { content, latencyMs } = await client.chat({
    systemPrompt: 'Respond with a JSON object describing this image in one field: "description".',
    userContent: 'Describe this test image.',
    images: [testImageB64],
  });
  logger.info({ latencyMs, content }, 'seedeer smoke test complete');
  return { content, latencyMs };
}
