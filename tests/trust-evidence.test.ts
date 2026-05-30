import { describe, expect, it } from "vitest";
import { createEndpointTrustEvidence, type EndpointTrustPaths } from "../src/core/trustEvidence.js";
import type { CompatibilityMatrix } from "../src/core/schemas.js";

const paths: EndpointTrustPaths = {
  reportsDir: "D:\\tmp\\endpoint-evidence-test\\.endpoint-doctor\\reports",
  matrixJson: "D:\\tmp\\endpoint-evidence-test\\.endpoint-doctor\\reports\\compatibility-matrix.json",
  reportJson: "D:\\tmp\\endpoint-evidence-test\\.endpoint-doctor\\reports\\endpoint-doctor-report.json",
  reportMarkdown: "D:\\tmp\\endpoint-evidence-test\\.endpoint-doctor\\reports\\endpoint-doctor-report.md",
  reportHtml: "D:\\tmp\\endpoint-evidence-test\\.endpoint-doctor\\reports\\endpoint-doctor-report.html"
};

describe("endpoint-doctor trust evidence", () => {
  it("normalizes endpoint compatibility matrices into trust evidence", async () => {
    const matrix: CompatibilityMatrix = {
      profile: {
        name: "local-llm",
        baseUrl: "http://localhost:1234/v1",
        model: "qwen3-coder",
        apiKeyEnv: "OPENAI_COMPATIBLE_API_KEY"
      },
      generatedAt: "2026-05-30T00:00:00.000Z",
      results: [],
      findings: [
        {
          id: "tools.failed",
          title: "Tool calling failed",
          status: "fail",
          severity: "high",
          message: "Coding agents rely on tool calls.",
          recommendation: "Use a model/provider combination with OpenAI-style tool support."
        }
      ],
      summary: {
        decision: "blocked",
        pass: 0,
        warn: 0,
        fail: 1,
        skip: 0,
        agentReadinessScore: 35
      }
    };

    const evidence = await createEndpointTrustEvidence({ paths, version: "0.1.0", matrices: [matrix] });

    expect(evidence.schemaVersion).toBe("agent.trust.evidence.v1");
    expect(evidence.subject.type).toBe("endpoint");
    expect(evidence.decision).toBe("block");
    expect(evidence.score).toBe(65);
    expect(evidence.findings[0]?.id).toContain("tools.failed");
  });
});
