import { access } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readOptionalJsonFile } from "./json.js";
import {
  CompatibilityMatrixSchema,
  DoctorReportSchema,
  type CompatibilityMatrix,
  type DoctorReport,
  type EndpointFinding
} from "./schemas.js";

export type TrustDecision = "allow" | "review" | "block";
export type TrustSeverity = "info" | "low" | "medium" | "warning" | "high" | "critical";

export interface EndpointTrustPaths {
  reportsDir: string;
  matrixJson: string;
  reportJson: string;
  reportMarkdown: string;
  reportHtml: string;
}

export interface TrustEvidenceFinding {
  id: string;
  severity: TrustSeverity;
  title: string;
  message: string;
  recommendation?: string;
  source?: string;
}

export interface TrustEvidence {
  schemaVersion: "agent.trust.evidence.v1";
  tool: {
    name: "agent-endpoint-doctor";
    version: string;
  };
  subject: {
    type: "endpoint";
    name: string;
  };
  decision: TrustDecision;
  score: number;
  generatedAt: string;
  findings: TrustEvidenceFinding[];
  artifacts: Array<{ type: string; path: string }>;
  recommendations: string[];
}

const MatrixArraySchema = z.array(CompatibilityMatrixSchema);

export function trustEvidencePath(paths: EndpointTrustPaths): string {
  return join(paths.reportsDir, "trust-evidence.json");
}

export async function createEndpointTrustEvidence(input: {
  paths: EndpointTrustPaths;
  version: string;
  matrices?: CompatibilityMatrix[];
  report?: DoctorReport;
}): Promise<TrustEvidence> {
  const matrices = input.matrices ?? await readOptionalJsonFile(input.paths.matrixJson, MatrixArraySchema);
  const report = input.report ?? await readOptionalJsonFile(input.paths.reportJson, DoctorReportSchema);
  const sourceMatrices = matrices ?? report?.matrices ?? [];
  if (sourceMatrices.length === 0) {
    throw new Error("No endpoint compatibility matrix found. Run agent-endpoint-doctor demo or test first.");
  }
  const decision = worstDecision(sourceMatrices.map((matrix) => mapDecision(matrix.summary.decision)));
  const findings = sourceMatrices.flatMap((matrix) => matrix.findings.filter((finding) => finding.status !== "pass").map((finding) => toTrustFinding(matrix, finding)));
  const recommendations = new Set(report?.recommendations ?? findings.map((finding) => finding.recommendation).filter((item): item is string => item !== undefined));
  if (decision === "allow") {
    recommendations.add("Keep rerunning endpoint compatibility tests before switching agent providers or models.");
  }
  return {
    schemaVersion: "agent.trust.evidence.v1",
    tool: {
      name: "agent-endpoint-doctor",
      version: input.version
    },
    subject: {
      type: "endpoint",
      name: sourceMatrices.map((matrix) => matrix.profile.name).join(", ")
    },
    decision,
    score: Math.max(...sourceMatrices.map((matrix) => readinessToRisk(matrix.summary.agentReadinessScore))),
    generatedAt: sourceMatrices[0]?.generatedAt ?? new Date().toISOString(),
    findings,
    artifacts: await existingArtifacts(input.paths),
    recommendations: [...recommendations]
  };
}

function toTrustFinding(matrix: CompatibilityMatrix, finding: EndpointFinding): TrustEvidenceFinding {
  const evidence: TrustEvidenceFinding = {
    id: `endpoint.${matrix.profile.name}.${finding.id}`,
    severity: finding.severity,
    title: finding.title,
    message: finding.message,
    source: matrix.profile.baseUrl
  };
  if (finding.recommendation !== undefined) {
    evidence.recommendation = finding.recommendation;
  }
  return evidence;
}

function mapDecision(decision: "ready" | "review" | "blocked"): TrustDecision {
  if (decision === "blocked") {
    return "block";
  }
  if (decision === "review") {
    return "review";
  }
  return "allow";
}

function worstDecision(decisions: TrustDecision[]): TrustDecision {
  if (decisions.includes("block")) {
    return "block";
  }
  if (decisions.includes("review")) {
    return "review";
  }
  return "allow";
}

function readinessToRisk(score: number): number {
  return Math.max(0, Math.min(100, 100 - Math.round(score)));
}

async function existingArtifacts(paths: EndpointTrustPaths): Promise<Array<{ type: string; path: string }>> {
  const candidates: Array<{ type: string; path: string }> = [
    { type: "endpoint-matrix-json", path: paths.matrixJson },
    { type: "endpoint-report-json", path: paths.reportJson },
    { type: "endpoint-report-markdown", path: paths.reportMarkdown },
    { type: "endpoint-report-html", path: paths.reportHtml }
  ];
  const existing: Array<{ type: string; path: string }> = [];
  for (const candidate of candidates) {
    if (await fileExists(candidate.path)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
