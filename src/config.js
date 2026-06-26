import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const ConfigSchema = z.object({
  STREAM_URL: z.string().min(1, 'STREAM_URL is required'),
  VISION_BACKEND: z.enum(['ollama', 'seedeer']).default('ollama'),
  OLLAMA_URL: z.string().default('http://ollama:11434'),
  OLLAMA_MODEL: z.string().default('qwen3-vl:8b'),
  SEEDEER_MODEL: z.string().default('HuggingFaceTB/SmolVLM-256M-Instruct'),
  SEEDEER_MODE: z.enum(['process', 'thread', 'socket', 'grpc']).default('process'),
  SEEDEER_DEVICE: z.enum(['cpu', 'gpu', 'auto']).default('auto'),
  SYSTEM_PROMPT_FILE: z.string().default('./system-prompt.md'),
  TRIGGER_MODE: z.enum(['fps', 'motion', 'both']).default('fps'),
  FRAME_INTERVAL: z.coerce.number().positive().default(2),
  MIN_FRAME_INTERVAL: z.coerce.number().positive().default(1),
  SCENE_CHANGE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  FRAME_WIDTH: z.coerce.number().int().positive().default(320),
  FRAME_HEIGHT: z.coerce.number().int().positive().default(180),
  HISTORY_DEPTH: z.coerce.number().int().positive().default(10),
  HISTORY_IMAGES: z.coerce.number().int().min(0).default(0),
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_MODE: z.enum(['always', 'on_change']).default('on_change'),
  WEBHOOK_TOKEN: z.string().optional(),
  MCP_PORT: z.coerce.number().int().positive().default(3100),
  STREAM_RECONNECT_MAX: z.coerce.number().int().min(0).default(0),
});

function loadConfig(env = process.env) {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}

export const config = loadConfig();
export { loadConfig, ConfigSchema };
