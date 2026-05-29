import {
  CapabilityResultSchema,
  EndpointProfileSchema,
  type CapabilityResult,
  type EndpointProfile
} from "./schemas.js";

export interface EndpointClientOptions {
  profile: EndpointProfile;
  apiKey?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export class EndpointClient {
  readonly profile: EndpointProfile;
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(options: EndpointClientOptions) {
    this.profile = EndpointProfileSchema.parse({
      ...options.profile,
      baseUrl: normalizeBaseUrl(options.profile.baseUrl)
    });
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async testModels(): Promise<CapabilityResult> {
    return this.run("models", "/models", {
      method: "GET",
      headers: this.headers()
    });
  }

  async testChat(): Promise<CapabilityResult> {
    return this.run("chat", "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        temperature: 0,
        max_tokens: 16
      })
    });
  }

  async testStreaming(): Promise<CapabilityResult> {
    return this.run("streaming", "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        temperature: 0,
        max_tokens: 16,
        stream: true
      })
    }, "Expected a streaming-capable endpoint. Some compatible servers return normal JSON even when stream=true.", validateStreaming);
  }

  async testTools(stream = false): Promise<CapabilityResult> {
    const capability = stream ? "streaming_tools" : "tools";
    return this.run(capability, "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        messages: [{ role: "user", content: "Call endpoint_doctor_ping with ok=true. Do not answer in plain text." }],
        temperature: 0,
        max_tokens: 64,
        stream,
        tools: [
          {
            type: "function",
            function: {
              name: "endpoint_doctor_ping",
              description: "Return whether the endpoint can accept OpenAI-style tool schemas.",
              parameters: {
                type: "object",
                properties: {
                  ok: { type: "boolean" }
                },
                required: ["ok"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: {
          type: "function",
          function: { name: "endpoint_doctor_ping" }
        }
      })
    }, stream
      ? "Streaming tool calls are the most fragile agent path. Disable streaming for tool-heavy workflows if this fails."
      : "A pass means the endpoint returned OpenAI-style tool_calls, not just that it accepted the request.",
    stream ? validateStreamingToolCalls : validateToolCalls);
  }

  async testJsonMode(): Promise<CapabilityResult> {
    return this.run("json_mode", "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        messages: [{ role: "user", content: "Return {\"ok\":true} as JSON." }],
        temperature: 0,
        max_tokens: 32,
        response_format: { type: "json_object" }
      })
    }, "JSON mode should return parseable JSON in message content.", validateJsonMode);
  }

  async testResponses(): Promise<CapabilityResult> {
    return this.run("responses", "/responses", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        input: "Reply with exactly OK.",
        max_output_tokens: 16
      })
    }, "Some clients can force /chat/completions when /responses is unavailable.", validateResponses);
  }

  async testEmbeddings(): Promise<CapabilityResult> {
    return this.run("embeddings", "/embeddings", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        input: "endpoint doctor embedding probe"
      })
    }, "Many chat models do not support /embeddings. Use a dedicated embedding model if this fails.", validateEmbeddings);
  }

  private async run(
    capability: CapabilityResult["capability"],
    endpoint: string,
    init: RequestInit,
    recommendation?: string,
    validate?: ResponseValidator
  ): Promise<CapabilityResult> {
    const started = performance.now();
    try {
      const response = await this.fetchFn(`${this.profile.baseUrl}${endpoint}`, init);
      const latencyMs = Math.round(performance.now() - started);
      const text = await safeText(response);
      if (!response.ok) {
        return CapabilityResultSchema.parse({
          capability,
          status: "fail",
          severity: endpoint === "/embeddings" ? "warning" : "high",
          latencyMs,
          statusCode: response.status,
          message: `Endpoint returned HTTP ${response.status}.`,
          evidence: { preview: redactSecrets(text.slice(0, 240)) },
          recommendation: recommendation ?? "Check base URL, API key, model ID, and provider-specific endpoint support."
        });
      }
      const contentType = response.headers.get("content-type") ?? "";
      const validation = validate?.(text, contentType);
      return CapabilityResultSchema.parse({
        capability,
        status: validation?.status ?? "pass",
        severity: validation?.severity ?? "info",
        latencyMs,
        statusCode: response.status,
        message: validation?.message ?? (contentType.includes("text/event-stream")
          ? "Endpoint accepted request and returned an event stream."
          : "Endpoint accepted request."),
        evidence: {
          contentType,
          preview: redactSecrets(text.slice(0, 240)),
          ...validation?.evidence
        },
        recommendation: validation?.recommendation ?? recommendation
      });
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      return CapabilityResultSchema.parse({
        capability,
        status: "fail",
        severity: endpoint === "/embeddings" ? "warning" : "critical",
        latencyMs,
        message: redactSecrets(error instanceof Error ? error.message : String(error)),
        recommendation: recommendation ?? "Confirm the server is running, the URL ends in /v1, and the API key is valid."
      });
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };
    if (this.apiKey !== undefined && this.apiKey.length > 0) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  for (const suffix of ["/chat/completions", "/models", "/embeddings"]) {
    if (trimmed.endsWith(suffix)) return trimmed.slice(0, -suffix.length);
  }
  return trimmed;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***")
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]+/gi, "api_key=***");
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

interface ResponseValidation {
  status: "pass" | "warn" | "fail";
  severity: "info" | "warning" | "high" | "critical";
  message: string;
  evidence?: Record<string, string | number | boolean> | undefined;
  recommendation?: string | undefined;
}

type ResponseValidator = (text: string, contentType: string) => ResponseValidation;

function validateStreaming(text: string, contentType: string): ResponseValidation {
  const looksLikeSse = contentType.includes("text/event-stream") || text.includes("data:");
  return looksLikeSse
    ? {
      status: "pass",
      severity: "info",
      message: "Endpoint returned SSE-style streaming data.",
      evidence: { sse: true }
    }
    : {
      status: "warn",
      severity: "warning",
      message: "Endpoint accepted stream=true but did not return obvious SSE data.",
      evidence: { sse: false },
      recommendation: "Test the exact agent client; some clients hang when stream=true returns normal JSON."
    };
}

function validateToolCalls(text: string): ResponseValidation {
  const parsed = parseJson(text);
  const hasToolCalls = parsedHasPath(parsed, ["choices", 0, "message", "tool_calls"]);
  return hasToolCalls
    ? {
      status: "pass",
      severity: "info",
      message: "Endpoint returned OpenAI-style message.tool_calls.",
      evidence: { toolCalls: true }
    }
    : {
      status: "fail",
      severity: "high",
      message: "Endpoint accepted the tools request but did not return message.tool_calls.",
      evidence: { toolCalls: false },
      recommendation: "This endpoint may work for chat but fail in coding-agent tool workflows."
    };
}

function validateStreamingToolCalls(text: string, contentType: string): ResponseValidation {
  const looksLikeSse = contentType.includes("text/event-stream") || text.includes("data:");
  const hasToolDelta = text.includes("tool_calls") || text.includes("function_call");
  if (looksLikeSse && hasToolDelta) {
    return {
      status: "pass",
      severity: "info",
      message: "Endpoint streamed tool-call deltas.",
      evidence: { sse: true, toolDeltas: true }
    };
  }
  return {
    status: "fail",
    severity: "high",
    message: "Endpoint did not stream recognizable tool-call deltas.",
    evidence: { sse: looksLikeSse, toolDeltas: hasToolDelta },
    recommendation: "Disable streaming for tool-heavy agent workflows or use a provider/runtime with streaming tool-call support."
  };
}

function validateJsonMode(text: string): ResponseValidation {
  const parsed = parseJson(text);
  const content = readPath(parsed, ["choices", 0, "message", "content"]);
  if (typeof content === "string") {
    try {
      JSON.parse(content);
      return {
        status: "pass",
        severity: "info",
        message: "Endpoint returned parseable JSON content.",
        evidence: { parseableJson: true }
      };
    } catch {
      return {
        status: "fail",
        severity: "warning",
        message: "Endpoint accepted JSON mode but message content was not parseable JSON.",
        evidence: { parseableJson: false },
        recommendation: "Use tool schemas or provider-specific structured output controls for automation."
      };
    }
  }
  return {
    status: "warn",
    severity: "warning",
    message: "Endpoint accepted JSON mode but response shape did not expose message.content.",
    evidence: { contentFound: false }
  };
}

function validateResponses(text: string): ResponseValidation {
  const parsed = parseJson(text);
  const hasOutput = parsedHasPath(parsed, ["output"]) || parsedHasPath(parsed, ["output_text"]);
  return hasOutput
    ? {
      status: "pass",
      severity: "info",
      message: "Endpoint accepted /responses request.",
      evidence: { responsesShape: true }
    }
    : {
      status: "warn",
      severity: "warning",
      message: "Endpoint accepted /responses but did not return a recognizable Responses API shape.",
      evidence: { responsesShape: false }
    };
}

function validateEmbeddings(text: string): ResponseValidation {
  const parsed = parseJson(text);
  const hasEmbeddings = parsedHasPath(parsed, ["data", 0, "embedding"]);
  return hasEmbeddings
    ? {
      status: "pass",
      severity: "info",
      message: "Endpoint returned embedding vectors.",
      evidence: { embeddings: true }
    }
    : {
      status: "fail",
      severity: "warning",
      message: "Endpoint accepted /embeddings but did not return embedding vectors.",
      evidence: { embeddings: false },
      recommendation: "Use a dedicated embedding model or provider endpoint."
    };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parsedHasPath(value: unknown, path: Array<string | number>): boolean {
  return readPath(value, path) !== undefined;
}

function readPath(value: unknown, path: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}
