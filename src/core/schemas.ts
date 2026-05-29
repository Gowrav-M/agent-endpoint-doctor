import { z } from "zod";

export const CapabilitySchema = z.enum([
  "models",
  "chat",
  "streaming",
  "tools",
  "streaming_tools",
  "json_mode",
  "responses",
  "embeddings",
  "vision"
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const StatusSchema = z.enum(["pass", "warn", "fail", "skip"]);
export type Status = z.infer<typeof StatusSchema>;

export const SeveritySchema = z.enum(["info", "warning", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const AgentToolSchema = z.enum(["cursor", "continue", "opencode", "cline", "roo", "litellm", "custom"]);
export type AgentTool = z.infer<typeof AgentToolSchema>;

export const EndpointProfileSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.url(),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1).default("OPENAI_COMPATIBLE_API_KEY"),
  providerHint: z.string().optional()
});
export type EndpointProfile = z.infer<typeof EndpointProfileSchema>;

export const CapabilityResultSchema = z.object({
  capability: CapabilitySchema,
  status: StatusSchema,
  severity: SeveritySchema,
  latencyMs: z.number().nonnegative().optional(),
  statusCode: z.number().int().positive().optional(),
  message: z.string().min(1),
  evidence: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  recommendation: z.string().optional()
});
export type CapabilityResult = z.infer<typeof CapabilityResultSchema>;

export const EndpointFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: StatusSchema,
  severity: SeveritySchema,
  message: z.string().min(1),
  recommendation: z.string().optional()
});
export type EndpointFinding = z.infer<typeof EndpointFindingSchema>;

export const CompatibilityMatrixSchema = z.object({
  profile: EndpointProfileSchema,
  generatedAt: z.iso.datetime(),
  results: z.array(CapabilityResultSchema),
  findings: z.array(EndpointFindingSchema),
  summary: z.object({
    decision: z.enum(["ready", "review", "blocked"]),
    pass: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    skip: z.number().int().nonnegative(),
    agentReadinessScore: z.number().min(0).max(100)
  })
});
export type CompatibilityMatrix = z.infer<typeof CompatibilityMatrixSchema>;

export const DoctorReportSchema = z.object({
  schemaVersion: z.literal("agent-endpoint-doctor.report.v1"),
  generatedAt: z.iso.datetime(),
  project: z.object({
    name: z.literal("agent-endpoint-doctor"),
    version: z.string().min(1)
  }),
  matrices: z.array(CompatibilityMatrixSchema),
  recommendations: z.array(z.string().min(1)),
  caveats: z.array(z.string().min(1))
});
export type DoctorReport = z.infer<typeof DoctorReportSchema>;

export function statusRank(status: Status): number {
  switch (status) {
    case "pass":
      return 0;
    case "skip":
      return 1;
    case "warn":
      return 2;
    case "fail":
      return 3;
  }
}
