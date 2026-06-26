import { logger } from './logger.js';

/**
 * Runs a single description call against a test image and logs the result.
 * Works for any client implementing `chat({systemPrompt, userContent, images})`.
 */
export async function smokeTest(client, testImageB64) {
  logger.info({ model: client.model }, 'running vision smoke test');
  const { content, latencyMs } = await client.chat({
    systemPrompt: 'Respond with a JSON object describing this image in one field: "description".',
    userContent: 'Describe this test image.',
    images: [testImageB64],
  });
  logger.info({ latencyMs, content }, 'vision smoke test complete');
  return { content, latencyMs };
}
