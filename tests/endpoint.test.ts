import { describe, expect, it } from "vitest";
import { EndpointClient, normalizeBaseUrl, redactSecrets } from "../src/core/endpoint.js";

describe("endpoint client", () => {
  it("normalizes endpoint URLs", () => {
    expect(normalizeBaseUrl("http://localhost:1234/v1/chat/completions")).toBe("http://localhost:1234/v1");
    expect(normalizeBaseUrl("http://localhost:1234/v1/models")).toBe("http://localhost:1234/v1");
  });

  it("redacts common API key shapes", () => {
    expect(redactSecrets("Bearer sk-secret")).toContain("Bearer ***");
    expect(redactSecrets("api_key=nvapi-secret")).toContain("api_key=***");
  });

  it("passes chat when endpoint accepts request", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
    const client = new EndpointClient({
      profile: {
        name: "test",
        baseUrl: "http://localhost:1234/v1",
        model: "qwen3"
      },
      fetchFn
    });
    const result = await client.testChat();
    expect(result.status).toBe("pass");
    expect(result.capability).toBe("chat");
  });

  it("fails tool test with useful recommendation", async () => {
    const fetchFn = async () => new Response("tools unsupported", { status: 400 });
    const client = new EndpointClient({
      profile: {
        name: "test",
        baseUrl: "http://localhost:1234/v1",
        model: "qwen3"
      },
      fetchFn
    });
    const result = await client.testTools();
    expect(result.status).toBe("fail");
    expect(result.recommendation).toContain("OpenAI-style tools");
  });
});
