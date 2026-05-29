import type { CompatibilityMatrix, DoctorReport } from "../core/schemas.js";

export function buildReport(input: {
  version: string;
  matrices: CompatibilityMatrix[];
}): DoctorReport {
  const recommendations = new Set<string>();
  for (const matrix of input.matrices) {
    for (const finding of matrix.findings) {
      if (finding.recommendation !== undefined) recommendations.add(finding.recommendation);
    }
  }
  if (input.matrices.length === 0) {
    recommendations.add("Run agent-endpoint-doctor test --base-url <url> --model <model> to generate a compatibility matrix.");
  }
  return {
    schemaVersion: "agent-endpoint-doctor.report.v1",
    generatedAt: new Date().toISOString(),
    project: {
      name: "agent-endpoint-doctor",
      version: input.version
    },
    matrices: input.matrices,
    recommendations: [...recommendations],
    caveats: [
      "A passing matrix means the endpoint accepted the tested request shapes. It does not guarantee every IDE or agent client implements the same parsing behavior.",
      "Do not put real secrets, private source code, regulated data, or customer data into test prompts unless the provider and your organization allow it.",
      "This tool is a compatibility tester, not a router, proxy, or provider endorsement."
    ]
  };
}

export function renderMarkdown(report: DoctorReport): string {
  const lines = [
    "# agent-endpoint-doctor Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    ...report.matrices.flatMap(renderMatrixMarkdown),
    "## Recommendations",
    "",
    ...(report.recommendations.length > 0 ? report.recommendations.map((item) => `- ${item}`) : ["- No recommendations."]),
    "",
    "## Caveats",
    "",
    ...report.caveats.map((item) => `- ${item}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

export function renderHtml(report: DoctorReport): string {
  const rows = report.matrices.flatMap((matrix) =>
    matrix.results.map((result) => `<tr><td>${escapeHtml(matrix.profile.name)}</td><td>${escapeHtml(result.capability)}</td><td>${escapeHtml(result.status)}</td><td>${result.latencyMs ?? ""}</td><td>${escapeHtml(result.message)}</td></tr>`)
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>agent-endpoint-doctor Report</title>
  <style>
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 1080px; margin: 2rem auto; color: #17202a; line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #d8e0ea; padding: 0.55rem; text-align: left; vertical-align: top; }
    th { background: #eef3f8; }
    code { background: #eef3f8; padding: 0.12rem 0.35rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>agent-endpoint-doctor Report</h1>
  <p>Generated: ${escapeHtml(report.generatedAt)}</p>
  ${report.matrices.map((matrix) => `<h2>${escapeHtml(matrix.profile.name)}</h2><p>Decision: <strong>${matrix.summary.decision.toUpperCase()}</strong> · Agent readiness: ${matrix.summary.agentReadinessScore}/100</p>`).join("\n")}
  <table>
    <thead><tr><th>Endpoint</th><th>Capability</th><th>Status</th><th>Latency</th><th>Message</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Recommendations</h2>
  <ul>${report.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  <h2>Caveats</h2>
  <ul>${report.caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
</body>
</html>
`;
}

function renderMatrixMarkdown(matrix: CompatibilityMatrix): string[] {
  return [
    `## ${matrix.profile.name}`,
    "",
    `- Base URL: \`${matrix.profile.baseUrl}\``,
    `- Model: \`${matrix.profile.model}\``,
    `- Decision: **${matrix.summary.decision.toUpperCase()}**`,
    `- Agent readiness score: ${matrix.summary.agentReadinessScore}/100`,
    "",
    "| Capability | Status | Latency | Message |",
    "| --- | --- | ---: | --- |",
    ...matrix.results.map((result) => `| ${result.capability} | ${result.status} | ${result.latencyMs ?? ""} | ${result.message.replaceAll("|", "\\|")} |`),
    "",
    "### Findings",
    "",
    ...matrix.findings.map((finding) => `- [${finding.status.toUpperCase()}] ${finding.title}: ${finding.message}`),
    ""
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
