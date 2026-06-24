# stream-describer

A standalone Docker service that continuously pulls frames from a video stream,
runs vision inference via a local Ollama model, maintains a JSON state history,
exposes an MCP server (streamable HTTP), and optionally fires webhooks on scene
changes. Designed to slot into the LCYT ecosystem as a peer container.

## Architecture

```
                 ┌──────────────┐
   STREAM_URL ──►│ FrameBroker  │  (fps extractor / motion detector / both)
                 └──────┬───────┘
                        │ JPEG frame
                        ▼
                 ┌──────────────┐      ┌─────────────┐
                 │ Inference    │◄────►│  Ollama     │
                 │ Engine       │      │ (vision LLM)│
                 └──────┬───────┘      └─────────────┘
                        │ JSON scene state
                        ▼
                 ┌──────────────┐
                 │ StateHistory │  (bounded JSON + image buffers)
                 └──────┬───────┘
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
     ┌─────────────┐         ┌─────────────┐
     │ MCP server  │         │  Webhook    │
     │ (streamable │         │  (optional) │
     │  HTTP)      │         └─────────────┘
     └─────────────┘
```

## Environment variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `STREAM_URL` | string | *(required)* | Any ffmpeg-readable stream URL (RTSP/HTTP/file). |
| `OLLAMA_URL` | string | `http://ollama:11434` | Base URL of the Ollama server. |
| `OLLAMA_MODEL` | string | `qwen3-vl:8b` | Vision-capable model to run inference with. |
| `SYSTEM_PROMPT_FILE` | string | `./system-prompt.md` | Path to the system prompt defining the JSON schema. |
| `TRIGGER_MODE` | `fps` \| `motion` \| `both` | `fps` | How frames are selected for inference. |
| `FRAME_INTERVAL` | number (seconds) | `2` | Interval between captures in `fps` mode. |
| `MIN_FRAME_INTERVAL` | number (seconds) | `1` | Floor between captures in `motion` mode; dedupe window in `both` mode. |
| `SCENE_CHANGE_THRESHOLD` | number (0-1) | `0.3` | ffmpeg scene-change sensitivity; lower triggers more often. |
| `FRAME_WIDTH` | int | `320` | Frame width sent to Ollama. |
| `FRAME_HEIGHT` | int | `180` | Frame height sent to Ollama. |
| `HISTORY_DEPTH` | int | `10` | Number of past JSON states kept and sent as context. |
| `HISTORY_IMAGES` | int | `0` | Number of past frame images kept and sent as additional visual context. |
| `WEBHOOK_URL` | string | *(unset)* | If set, POSTs scene-change events here. |
| `WEBHOOK_MODE` | `always` \| `on_change` | `on_change` | Whether to fire on every inference or only on detected change. |
| `WEBHOOK_TOKEN` | string | *(unset)* | Bearer token sent as `Authorization: Bearer <token>`. |
| `MCP_PORT` | int | `3100` | Port the MCP/streamable-HTTP server listens on. |
| `STREAM_RECONNECT_MAX` | int | `0` (unlimited) | Max ffmpeg reconnect attempts before giving up. |

## Choosing an Ollama vision model

`OLLAMA_MODEL` must be a vision-capable (multimodal) model pulled into your
Ollama instance (`ollama pull <model>`). Latency matters more than raw
quality here — the model needs to keep up with `FRAME_INTERVAL` — so prefer
the smallest model that still produces reliable JSON for your prompt.

| Model | Size | Notes |
|---|---|---|
| `moondream` | ~1.8B | Fastest option here, runs well on CPU or modest GPUs. Good for simple scene/posture detection at short `FRAME_INTERVAL`; less reliable on detailed JSON schemas or fine-grained subjects. |
| `qwen2.5vl:3b` | 3B | Good low-latency default. Solid instruction-following for structured JSON output, reasonable detail recognition. |
| `qwen3-vl:8b` | 8B | The default in `.env.example`. Best balance of accuracy and structured-output reliability for most production use; needs a decent GPU to hit sub-2s latency. |
| `llama3.2-vision:11b` | 11B | Strong general scene understanding, slower than the qwen-vl models at similar accuracy; worth trying if qwen3-vl underperforms on your footage. |
| `minicpm-v` | ~8B | Competitive alternative to qwen3-vl, sometimes better at OCR/text-in-frame (e.g. on-screen graphics, signage). |
| `llava:13b` / `llava:34b` | 13B / 34B | Higher quality but noticeably slower; only worth it for `motion` mode with a generous `MIN_FRAME_INTERVAL`, or non-realtime backfill use cases. |

Always run [`node scripts/ollama-smoke-test.js`](scripts/ollama-smoke-test.js)
against a candidate model before committing to it — confirm latency is
comfortably under `FRAME_INTERVAL` and that the response is valid JSON
matching your system prompt's schema (Ollama's `format: "json"` constrains
syntax, but not your specific field names/enums).

## Writing a system prompt

The system prompt (`SYSTEM_PROMPT_FILE`) tells the model what to look for and
the exact JSON shape to respond with. A good prompt for a fixed-camera
production setting typically includes three things:

1. **Camera views** — the distinct shots the stream may show (e.g. wide shot,
   close-up on a speaker, audience shot), so the model can identify which one
   is active.
2. **Named positions** — an enum of expected phases of the event (e.g.
   liturgical positions, agenda items, match phases) so descriptions stay
   consistent frame to frame.
3. **A strict JSON schema** — the exact fields you want back, with allowed
   values where relevant (e.g. `liturgical_position`, `movement`,
   `congregation_posture`, `suggested_camera`).

See [`examples/riihimaen-kirkko-prompt.md`](examples/riihimaen-kirkko-prompt.md)
for a full example written for a Finnish Lutheran main service.

The model is also given the last `HISTORY_DEPTH` JSON states (and, if
`HISTORY_IMAGES > 0`, the last few frame images) as context, so prompts should
instruct the model to stay consistent with prior state unless the current
frame clearly supports a transition.

## Connecting to MCP

`stream-describer` exposes an MCP server over streamable HTTP at
`http://<host>:<MCP_PORT>/mcp`. It is stateless — each request gets its own
short-lived server/transport pair, so no session bootstrapping is required
between calls.

Tools exposed:

- **`describe`** — latest scene state, with `changed` flag and stream status.
- **`describe_now`** — captures a single current frame directly from the
  stream (bypassing the fps/motion schedule) and runs inference on it
  immediately, returning the result synchronously.
- **`get_history`** — last `n` states (default `HISTORY_DEPTH`).
- **`restart`** — reload the system prompt (`systemPromptPath` or
  `systemPromptContent`) and clear state history.
- **`status`** — stream connectivity/reconnect state, trigger mode, last frame
  and inference timestamps, last inference latency, and the Ollama model in use.

From Claude Code, add it as an MCP server pointing at
`http://<host>:<MCP_PORT>/mcp` using the streamable HTTP transport. From
lcyt-bridge or another MCP client, connect the same way — no auth is required
by default since the service is intended to run on a private LCYT network.

A `GET /health` endpoint is also exposed for container health checks.

## Trigger mode guide

- **`fps`** — captures a frame every `FRAME_INTERVAL` seconds regardless of
  content. Predictable load on Ollama; good default for most productions.
- **`motion`** — only captures when ffmpeg's scene filter detects a change
  above `SCENE_CHANGE_THRESHOLD`, floored by `MIN_FRAME_INTERVAL`. Lower
  compute cost on long, mostly-static streams, but can miss slow continuous
  motion and may need threshold tuning to avoid false triggers from lighting
  flicker.
- **`both`** — runs both sources; whichever fires first wins, with
  `MIN_FRAME_INTERVAL` deduping near-simultaneous triggers. Most responsive,
  highest compute cost.

| Use case | `FRAME_INTERVAL` | `TRIGGER_MODE` |
|---|---|---|
| Liturgical production | 2s | `both` |
| Low-compute / long service | 10s | `motion` |
| Fast-paced event | 1s | `fps` |

### Tuning `SCENE_CHANGE_THRESHOLD`

The default of `0.3` is a reasonable starting point for a fixed camera with
moderate movement (e.g. a presider moving between altar and pulpit). Start
there and adjust against your own footage:

- If lighting flicker, video noise, or slow camera pans cause frequent
  false triggers, raise the threshold (e.g. `0.4`–`0.5`).
- If subtle but meaningful movement (e.g. a presider's hand gesture, a
  seated-to-standing transition) is being missed, lower it (e.g.
  `0.15`–`0.25`).
- Always validate against a recording of the actual venue/camera before
  relying on `motion` or `both` mode in production — lighting rigs and camera
  noise floors vary significantly between venues.

## Running locally

```bash
npm install
cp .env.example .env   # fill in STREAM_URL at minimum
npm start
```

ffmpeg must be available on `PATH`. The process verifies ffmpeg and Ollama
connectivity on startup and exits with a clear error if either is missing.

### Validating Ollama latency

Before relying on a given `FRAME_INTERVAL`, check that inference latency is
comfortably below it:

```bash
node scripts/ollama-smoke-test.js
```

This sends a static test JPEG to the configured Ollama model and logs the
round-trip latency.

## Running with Docker

```bash
docker compose up --build
```

See [`docker-compose.yml`](docker-compose.yml) for an example wiring
`stream-describer` to a peer `ollama` container on a shared `lcyt-net`
network. It is an example for local/integration use, not a production
manifest — adapt networking, secrets, and restart policy for your deployment.

Mount your own system prompt over the default one:

```yaml
volumes:
  - ./my-prompt.md:/app/system-prompt.md:ro
```

## Tests

```bash
npm test
```
