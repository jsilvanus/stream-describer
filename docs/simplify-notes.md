# /simplify notes — skipped findings

This file records cleanup findings surfaced during the `/simplify` pass on
`claude/stream-describer-phase-plan-y8ylh2` that were intentionally **not**
applied, along with why.

- **`InferenceEngine` scattered `last*` fields** (`lastFrameAt`,
  `lastInferenceAt`, `lastLatencyMs`, `lastChanged`) — suggested
  consolidating into a single `lastResult` object. Skipped: would change the
  class's public API, breaks `test/inferenceEngine.test.js`'s direct
  assertion on `engine.lastLatencyMs`, and `src/mcp.js`'s `status`/`describe`
  tools read these fields directly.
- **`src/promptLoader.js` watch/restart coupling** — restarting via a new
  path silently disables file watching. Borderline correctness issue, out of
  scope for a quality-only pass.
- **`src/frameBroker.js` closure capturing `this` in `onFrame`** — flagged
  by the efficiency agent, but agents themselves noted it's not a real leak,
  just worth noting.
- **`src/mcp.js` creating a new `McpServer`/`StreamableHTTPServerTransport`
  per HTTP request** — intentional stateless design, confirmed reasonable.
- **`src/webhook.js` `sendWithRetry` recursion as a shared `withRetry()`
  utility** — minor, single call site, not worth abstracting.
- **`isDeepStrictEqual` per-frame state comparison in `inferenceEngine.js`**
  — not an actual bottleneck (the Ollama network call dominates), only noted
  as a scaling consideration.
