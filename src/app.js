import { config } from './config.js';
import { logger } from './logger.js';
import { checkFfmpeg } from './ffmpegCheck.js';
import { OllamaClient } from './ollama.js';
import { PromptLoader } from './promptLoader.js';
import { StateHistory } from './stateHistory.js';
import { InferenceEngine } from './inferenceEngine.js';
import { FrameBroker } from './frameBroker.js';
import { jpegBufferToBase64 } from './utils.js';
import { createServer } from './server.js';
import { setupWebhook } from './webhook.js';

export async function bootstrap() {
  logger.info({ triggerMode: config.TRIGGER_MODE }, 'starting stream-describer');

  const ffmpegVersion = await checkFfmpeg();
  logger.info({ ffmpegVersion }, 'ffmpeg available');

  const ollama = new OllamaClient({ baseUrl: config.OLLAMA_URL, model: config.OLLAMA_MODEL });
  await ollama.verifyReachable();
  logger.info({ ollamaUrl: config.OLLAMA_URL, model: config.OLLAMA_MODEL }, 'ollama reachable');

  const promptLoader = new PromptLoader(config.SYSTEM_PROMPT_FILE);
  await promptLoader.load();
  logger.info({ path: config.SYSTEM_PROMPT_FILE }, 'system prompt loaded');

  const stateHistory = new StateHistory({
    historyDepth: config.HISTORY_DEPTH,
    historyImages: config.HISTORY_IMAGES,
  });

  const inferenceEngine = new InferenceEngine({ ollama, promptLoader, stateHistory });

  const frameBroker = new FrameBroker(config);
  frameBroker.onFrame((frameBuffer) => {
    const frameB64 = jpegBufferToBase64(frameBuffer);
    inferenceEngine.processFrame(frameBuffer, frameB64).catch((err) => {
      logger.error({ err }, 'unhandled error processing frame');
    });
  });

  setupWebhook({ inferenceEngine, config });

  const server = await createServer({ config, stateHistory, promptLoader, inferenceEngine, frameBroker });
  await server.listen({ host: '0.0.0.0', port: config.MCP_PORT });
  logger.info({ port: config.MCP_PORT }, 'mcp server listening');

  return { ollama, promptLoader, stateHistory, inferenceEngine, frameBroker, server };
}

export async function shutdown({ frameBroker, inferenceEngine, server }) {
  logger.info('shutting down stream-describer');
  frameBroker.stop();
  await inferenceEngine.drain();
  await server.close();
  logger.info('shutdown complete');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  bootstrap()
    .then((deps) => {
      deps.frameBroker.start();
      const onSignal = () => {
        shutdown(deps)
          .then(() => process.exit(0))
          .catch((err) => {
            logger.error({ err }, 'error during shutdown');
            process.exit(1);
          });
      };
      process.once('SIGTERM', onSignal);
      process.once('SIGINT', onSignal);
    })
    .catch((err) => {
      logger.error({ err }, 'fatal error during startup');
      process.exit(1);
    });
}
