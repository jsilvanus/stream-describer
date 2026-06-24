import { config } from './config.js';
import { logger } from './logger.js';
import { checkFfmpeg } from './ffmpegCheck.js';
import { OllamaClient } from './ollama.js';

export async function bootstrap() {
  logger.info({ triggerMode: config.TRIGGER_MODE }, 'starting stream-describer');

  const ffmpegVersion = await checkFfmpeg();
  logger.info({ ffmpegVersion }, 'ffmpeg available');

  const ollama = new OllamaClient({ baseUrl: config.OLLAMA_URL, model: config.OLLAMA_MODEL });
  await ollama.verifyReachable();
  logger.info({ ollamaUrl: config.OLLAMA_URL, model: config.OLLAMA_MODEL }, 'ollama reachable');

  return { ollama };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  bootstrap().catch((err) => {
    logger.error({ err }, 'fatal error during startup');
    process.exit(1);
  });
}
