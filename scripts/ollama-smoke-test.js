import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../src/config.js';
import { OllamaClient, smokeTest } from '../src/ollama.js';
import { logger } from '../src/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const imagePath = path.join(__dirname, '..', 'test', 'fixtures', 'test-frame.jpg');
  const imageB64 = (await readFile(imagePath)).toString('base64');
  const client = new OllamaClient({ baseUrl: config.OLLAMA_URL, model: config.OLLAMA_MODEL });
  await client.verifyReachable();
  await smokeTest(client, imageB64);
}

main().catch((err) => {
  logger.error({ err }, 'smoke test failed');
  process.exit(1);
});
