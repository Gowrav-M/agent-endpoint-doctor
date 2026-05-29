import { describe, expect, it } from "vitest";
import { buildMatrix } from "../src/core/matrix.js";
import { buildReport, renderHtml, renderMarkdown } from "../src/report/render.js";

describe("report rendering", () => {
  it("renders matrix sections", () => {
    const matrix = buildMatrix({
      name: "local",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen3",
      apiKeyEnv: "OPENAI_COMPATIBLE_API_KEY"
    }, [
      { capability: "chat", status: "pass", severity: "info", message: "ok" }
    ]);
    const report = buildReport({ version: "0.1.0", matrices: [matrix] });
    expect(renderMarkdown(report)).toContain("Agent readiness score");
    expect(renderHtml(report)).toContain("agent-endpoint-doctor Report");
  });
});
