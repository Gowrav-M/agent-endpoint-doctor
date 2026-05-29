import { describe, expect, it } from "vitest";
import { buildMatrix } from "../src/core/matrix.js";
import type { CapabilityResult, EndpointProfile } from "../src/core/schemas.js";

const profile: EndpointProfile = {
  name: "local",
  baseUrl: "http://localhost:1234/v1",
  model: "qwen3",
  apiKeyEnv: "OPENAI_COMPATIBLE_API_KEY"
};

describe("compatibility matrix", () => {
  it("blocks when chat fails", () => {
    const results: CapabilityResult[] = [{
      capability: "chat",
      status: "fail",
      severity: "critical",
      message: "failed"
    }];
    const matrix = buildMatrix(profile, results);
    expect(matrix.summary.decision).toBe("blocked");
    expect(matrix.findings.some((finding) => finding.id === "chat.failed")).toBe(true);
  });

  it("warns when streaming tool calls fail", () => {
    const results: CapabilityResult[] = [
      { capability: "chat", status: "pass", severity: "info", message: "ok" },
      { capability: "tools", status: "pass", severity: "info", message: "ok" },
      { capability: "streaming_tools", status: "fail", severity: "high", message: "bad" }
    ];
    const matrix = buildMatrix(profile, results);
    expect(matrix.summary.decision).toBe("review");
    expect(matrix.summary.agentReadinessScore).toBeLessThan(100);
  });
});
