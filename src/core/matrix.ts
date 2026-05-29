import {
  CompatibilityMatrixSchema,
  EndpointFindingSchema,
  type CapabilityResult,
  type CompatibilityMatrix,
  type EndpointFinding,
  type EndpointProfile
} from "./schemas.js";

export function buildMatrix(profile: EndpointProfile, results: CapabilityResult[]): CompatibilityMatrix {
  const counts = {
    pass: results.filter((result) => result.status === "pass").length,
    warn: results.filter((result) => result.status === "warn").length,
    fail: results.filter((result) => result.status === "fail").length,
    skip: results.filter((result) => result.status === "skip").length
  };
  const score = scoreResults(results);
  const findings = buildFindings(results);
  const decision = results.some((result) =>
    result.status === "fail" && ["chat", "streaming", "tools"].includes(result.capability)
  )
    ? "blocked"
    : counts.fail > 0 || counts.warn > 0
      ? "review"
      : "ready";
  return CompatibilityMatrixSchema.parse({
    profile,
    generatedAt: new Date().toISOString(),
    results,
    findings,
    summary: {
      decision,
      ...counts,
      agentReadinessScore: score
    }
  });
}

export function scoreResults(results: CapabilityResult[]): number {
  const weights: Record<CapabilityResult["capability"], number> = {
    models: 10,
    chat: 25,
    streaming: 15,
    tools: 20,
    streaming_tools: 15,
    json_mode: 10,
    responses: 8,
    embeddings: 3,
    vision: 2
  };
  let total = 0;
  let earned = 0;
  for (const result of results) {
    const weight = weights[result.capability];
    total += weight;
    if (result.status === "pass") earned += weight;
    if (result.status === "warn") earned += weight * 0.5;
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

function buildFindings(results: CapabilityResult[]): EndpointFinding[] {
  const findings: EndpointFinding[] = [];
  const byCapability = new Map(results.map((result) => [result.capability, result]));
  const chat = byCapability.get("chat");
  const tools = byCapability.get("tools");
  const streamingTools = byCapability.get("streaming_tools");
  const jsonMode = byCapability.get("json_mode");
  const responses = byCapability.get("responses");

  if (chat?.status === "fail") {
    findings.push(EndpointFindingSchema.parse({
      id: "chat.failed",
      title: "Chat completions failed",
      status: "fail",
      severity: "critical",
      message: "Agent clients cannot work if /chat/completions fails.",
      recommendation: "Fix base URL, API key, model ID, or provider routing before using this endpoint in an agent."
    }));
  }
  if (tools?.status === "fail") {
    findings.push(EndpointFindingSchema.parse({
      id: "tools.failed",
      title: "Tool calling failed",
      status: "fail",
      severity: "high",
      message: "Coding agents rely on tool calls for file edits, shell actions, search, and MCP-style workflows.",
      recommendation: "Use a model/provider combination with OpenAI-style tool support or route through a compatibility layer."
    }));
  }
  if (streamingTools?.status === "fail") {
    findings.push(EndpointFindingSchema.parse({
      id: "streaming_tools.failed",
      title: "Streaming tool calls failed",
      status: "warn",
      severity: "warning",
      message: "The endpoint may work for simple chat but break in agent mode when tools stream incrementally.",
      recommendation: "Disable streaming for tool-heavy workflows or test the exact agent client before rollout."
    }));
  }
  if (jsonMode?.status === "fail") {
    findings.push(EndpointFindingSchema.parse({
      id: "json_mode.failed",
      title: "Structured JSON mode failed",
      status: "warn",
      severity: "warning",
      message: "Structured output failures can break evals, config generation, and automated review workflows.",
      recommendation: "Use tool schemas or provider-specific structured-output settings when JSON mode is unavailable."
    }));
  }
  if (responses?.status === "fail") {
    findings.push(EndpointFindingSchema.parse({
      id: "responses.failed",
      title: "Responses API failed",
      status: "warn",
      severity: "warning",
      message: "Some modern agent clients use /responses for reasoning, summaries, or tool workflows.",
      recommendation: "Force /chat/completions in the client when possible, or use a provider that supports /responses."
    }));
  }
  if (findings.length === 0) {
    findings.push(EndpointFindingSchema.parse({
      id: "agent.ready",
      title: "Agent-critical paths passed",
      status: "pass",
      severity: "info",
      message: "The tested endpoint passed the core checks included in this matrix."
    }));
  }
  return findings;
}
