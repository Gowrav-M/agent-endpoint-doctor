# agent-endpoint-doctor

> Test whether any OpenAI-compatible endpoint actually works for AI coding agents.

“OpenAI-compatible” usually means the endpoint has similar URLs. It does not guarantee that Cursor, Continue, OpenCode, Cline, Roo, LiteLLM, or your own agent can use streaming, tool calls, streaming tool calls, JSON mode, embeddings, or model discovery correctly.

`agent-endpoint-doctor` creates a local compatibility matrix for those agent-critical paths.

```bash
npx agent-endpoint-doctor demo
```

The demo is offline and writes reports under `.endpoint-doctor/`.

## What It Tests

- `/v1/models`
- `/v1/chat/completions`
- streaming chat
- OpenAI-style tool calling
- streaming tool calls
- JSON mode / structured output request shape
- `/v1/responses`
- `/v1/embeddings`

## Quick Start

```bash
# Offline proof
npx agent-endpoint-doctor demo

# Test a local LM Studio, vLLM, Ollama-compatible, LiteLLM, or hosted endpoint
npx agent-endpoint-doctor test \
  --base-url http://localhost:1234/v1 \
  --model qwen3-coder

# Print saved matrix
npx agent-endpoint-doctor matrix

# Generate Continue/LiteLLM/OpenCode snippets
npx agent-endpoint-doctor config \
  --base-url http://localhost:1234/v1 \
  --model qwen3-coder

# Render reports
npx agent-endpoint-doctor report
```

PowerShell with an API key:

```powershell
$env:OPENAI_COMPATIBLE_API_KEY="sk-or-provider-key"
cmd /c npx -y agent-endpoint-doctor test --base-url https://example.com/v1 --model model-id
```

## Why This Exists

Agent workflows fail in places simple chat demos never touch.

| Simple API check | Real agent requirement |
| --- | --- |
| `GET /v1/models` works | model ID is accepted by the chat endpoint |
| chat returns text | streaming works without hanging |
| tool schema is accepted | tool calls stream in a client-readable format |
| JSON is requested | output is usable by evals and automation |
| `/responses` exists | modern clients can use reasoning/response workflows |
| endpoint is “compatible” | Cursor/Continue/OpenCode can actually use it |

The tool answers:

> Can I safely point my coding agent at this endpoint?

Research notes: [docs/research.md](docs/research.md)

## Output

```text
.endpoint-doctor/
  configs/
    continue.yaml
    litellm.yaml
    opencode.json
  reports/
    compatibility-matrix.json
    endpoint-doctor-report.json
    endpoint-doctor-report.md
    endpoint-doctor-report.html
```

## Not A Router

This project does not proxy traffic or route requests. LiteLLM, OpenRouter-style gateways, provider SDKs, and local runtimes already handle routing.

`agent-endpoint-doctor` is the preflight check and evidence report before you trust an endpoint inside an agent workflow.

## Development

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
node dist/cli.js demo
```

## Safety

Do not send private source code, customer data, secrets, medical data, financial data, or regulated data to a provider unless your organization and the provider terms allow it. The test prompts are intentionally tiny, but the endpoint still receives requests during live tests.

## License

MIT
