import { logger } from './logger.js';

/**
 * Subscribes to inferenceEngine 'stateChange' events and POSTs the result to
 * WEBHOOK_URL, respecting WEBHOOK_MODE. Never throws back into the inference
 * loop; retries once on failure.
 */
export function setupWebhook({ inferenceEngine, config, fetchImpl = fetch }) {
  if (!config.WEBHOOK_URL) {
    return null;
  }

  const handler = async (event) => {
    if (config.WEBHOOK_MODE === 'on_change' && !event.changed) {
      return;
    }
    const payload = {
      timestamp: event.timestamp,
      changed: event.changed,
      current: event.current,
      previous: event.previous,
    };
    await sendWithRetry(fetchImpl, config, payload);
  };

  inferenceEngine.on('stateChange', (event) => {
    handler(event).catch((err) => {
      logger.error({ err }, 'webhook handler failed unexpectedly');
    });
  });

  return handler;
}

async function sendWithRetry(fetchImpl, config, payload, attempt = 1) {
  const headers = { 'content-type': 'application/json' };
  if (config.WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${config.WEBHOOK_TOKEN}`;
  }
  try {
    const res = await fetchImpl(config.WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`webhook responded with HTTP ${res.status}`);
    }
  } catch (err) {
    if (attempt < 2) {
      logger.warn({ err, attempt }, 'webhook delivery failed, retrying once');
      return sendWithRetry(fetchImpl, config, payload, attempt + 1);
    }
    logger.error({ err }, 'webhook delivery failed after retry, giving up');
  }
}
