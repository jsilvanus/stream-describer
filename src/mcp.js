import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Builds an McpServer exposing the stream-describer tools, bound to the
 * running app's state. A fresh server+transport pair is created per HTTP
 * request (stateless mode) so tool reads always reflect current state.
 */
export function createMcpServer({ config, stateHistory, promptLoader, inferenceEngine, frameBroker }) {
  const server = new McpServer({ name: 'stream-describer', version: '1.0.0' });

  server.registerTool(
    'describe',
    {
      description: 'Returns the current scene state (latest inferred JSON) along with stream status.',
      inputSchema: {},
    },
    async () => {
      const latest = stateHistory.getLatest();
      const result = {
        timestamp: latest?.timestamp ?? null,
        state: latest?.state ?? null,
        changed: latest ? !!inferenceEngine.lastChanged : null,
        streamConnected: frameBroker.isConnected(),
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    'get_history',
    {
      description: 'Returns the last N inferred scene states (default HISTORY_DEPTH).',
      inputSchema: { n: z.number().int().positive().optional() },
    },
    async ({ n }) => {
      const history = stateHistory.getHistory(n ?? config.HISTORY_DEPTH);
      return { content: [{ type: 'text', text: JSON.stringify(history) }] };
    }
  );

  server.registerTool(
    'restart',
    {
      description:
        'Reloads the system prompt (from a new file path or inline content) and clears state history.',
      inputSchema: {
        systemPromptPath: z.string().optional(),
        systemPromptContent: z.string().optional(),
      },
    },
    async ({ systemPromptPath, systemPromptContent }) => {
      await promptLoader.reload({ systemPromptPath, systemPromptContent });
      stateHistory.clear();
      logger.info({ systemPromptPath: systemPromptPath ?? null }, 'mcp restart: prompt reloaded, history cleared');
      return {
        content: [
          { type: 'text', text: JSON.stringify({ ok: true, promptPath: promptLoader.path }) },
        ],
      };
    }
  );

  server.registerTool(
    'status',
    {
      description: 'Returns stream connectivity, trigger mode, and last frame/inference timing.',
      inputSchema: {},
    },
    async () => {
      const result = {
        streamConnected: frameBroker.isConnected(),
        sources: frameBroker.getStatus(),
        triggerMode: config.TRIGGER_MODE,
        lastFrameAt: inferenceEngine.lastFrameAt,
        lastInferenceAt: inferenceEngine.lastInferenceAt,
        lastLatencyMs: inferenceEngine.lastLatencyMs,
        ollamaModel: config.OLLAMA_MODEL,
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}

/**
 * Registers the streamable HTTP MCP endpoint and /health route on a Fastify instance.
 */
export function registerMcpRoutes(fastify, deps) {
  fastify.all('/mcp', async (request, reply) => {
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (err) {
      logger.error({ err }, 'mcp request handling failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'internal_error' }));
      }
    } finally {
      reply.raw.on('close', () => {
        transport.close();
        server.close();
      });
    }
  });

  fastify.get('/health', async () => ({ status: 'ok' }));
}
