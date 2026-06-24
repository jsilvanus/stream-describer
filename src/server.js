import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerMcpRoutes } from './mcp.js';
import { logger } from './logger.js';

export async function createServer(deps) {
  const fastify = Fastify({ logger });
  await fastify.register(cors);
  registerMcpRoutes(fastify, deps);
  return fastify;
}
