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
    }, "Expected a streaming-capable endpoint. Some compatible servers return normal JSON even when stream=true.");
  }

  async testTools(stream = false): Promise<CapabilityResult> {
    const capability = stream ? "streaming_tools" : "tools";
    return this.run(capability, "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        messages: [{ role: "user", content: "Use the tool only if needed, then answer OK." }],
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
        tool_choice: "auto"
      })
    }, stream
      ? "Streaming tool calls are the most fragile agent path. A pass means the endpoint accepted the request, not that every agent client can parse every stream event."
      : "A pass means the endpoint accepted an OpenAI-style tools request.");
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
    });
  }

  async testEmbeddings(): Promise<CapabilityResult> {
    return this.run("embeddings", "/embeddings", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.model,
        input: "endpoint doctor embedding probe"
      })
    }, "Many chat models do not support /embeddings. Use a dedicated embedding model if this fails.");
  }

  private async run(
    capability: CapabilityResult["capability"],
    endpoint: string,
    init: RequestInit,
    recommendation?: string
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
      return CapabilityResultSchema.parse({
        capability,
        status: "pass",
        severity: "info",
        latencyMs,
        statusCode: response.status,
        message: contentType.includes("text/event-stream")
          ? "Endpoint accepted request and returned an event stream."
          : "Endpoint accepted request.",
        evidence: {
          contentType,
          preview: redactSecrets(text.slice(0, 240))
        },
        recommendation
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
