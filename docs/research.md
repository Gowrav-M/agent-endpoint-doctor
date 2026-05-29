# Research Notes

## Problem

"OpenAI-compatible" is not enough for AI coding agents. Agent clients need more than a successful `/v1/models` call: they depend on chat completions, SSE streaming, OpenAI-style `tool_calls`, streaming tool-call deltas, JSON/structured output, and sometimes `/responses`.

## Evidence

- Continue documents generic OpenAI-compatible providers through `apiBase`, and also documents switches such as legacy completions and disabling `/responses`, which shows endpoint behavior varies by client and provider: https://docs.continue.dev/customize/model-providers/top-level/openai
- LiteLLM supports a very large provider surface, including OpenAI-compatible endpoints, NVIDIA NIM, Ollama, LM Studio, vLLM, OpenRouter, Together, and many others. That proves the ecosystem is fragmented enough to need adapters and diagnostics: https://docs.litellm.ai/docs/providers
- Microsoft Agent Framework issue #3437 asks for clearer local LLM/OpenAI-compatible support and explicitly calls out tool calling, streaming, structured output, and embeddings as compatibility concerns: https://github.com/microsoft/agent-framework/issues/3437
- OpenAI Codex issue #2507 shows a concrete local-provider failure where `/v1/models` worked but agent execution broke because the client assumed Ollama-specific endpoints and then hit streaming/parser errors with vLLM: https://github.com/openai/codex/issues/2507
- vLLM's documentation has dedicated sections for OpenAI-compatible serving, structured outputs, tool calling, integrations, and observability. That is strong evidence that "compatible" is a feature matrix, not a single boolean: https://docs.vllm.ai/en/latest/serving/online_serving/

## Product Direction

`agent-endpoint-doctor` should stay focused on compatibility evidence, not routing. LiteLLM and gateways already route traffic. The useful gap is a local preflight report that answers:

> Will this endpoint actually work inside my coding agent?

