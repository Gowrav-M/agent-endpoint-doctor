#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { EndpointClient, normalizeBaseUrl } from "./core/endpoint.js";
import { ensureDirs, packageRoot, resolvePaths } from "./core/files.js";
import { readOptionalJsonFile, writeJsonFile } from "./core/json.js";
import { buildMatrix } from "./core/matrix.js";
import {
  CompatibilityMatrixSchema,
  EndpointProfileSchema,
  type CapabilityResult,
  type CompatibilityMatrix
} from "./core/schemas.js";
import { createEndpointTrustEvidence, trustEvidencePath } from "./core/trustEvidence.js";
import { buildReport, renderHtml, renderMarkdown } from "./report/render.js";

const MatrixArraySchema = z.array(CompatibilityMatrixSchema);

interface GlobalOptions {
  cwd?: string;
}

const program = new Command();

program
  .name("agent-endpoint-doctor")
  .description("Local-first compatibility tester for OpenAI-compatible endpoints used by AI coding agents.")
  .version(await readPackageVersion())
  .option("--cwd <path>", "working directory for .endpoint-doctor output", process.cwd());

program
  .command("demo")
  .description("Run an offline compatibility demo and generate JSON/Markdown/HTML reports.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureDirs(ctx.paths);
    const fixture = await loadOfflineMatrix();
    const matrix = buildMatrix(fixture.profile, fixture.results);
    await writeMatrixAndReport(ctx.paths, ctx.version, [matrix]);
    printMatrix(matrix);
    console.log(`Report: ${ctx.paths.reportMarkdown}`);
  });

program
  .command("test")
  .description("Test whether an OpenAI-compatible endpoint actually works for agent workflows.")
  .requiredOption("--base-url <url>", "endpoint root ending in /v1, for example http://localhost:1234/v1")
  .requiredOption("--model <model>", "model ID to test")
  .option("--name <name>", "friendly endpoint name", "custom-endpoint")
  .option("--api-key-env <name>", "environment variable containing the API key", "OPENAI_COMPATIBLE_API_KEY")
  .option("--provider <hint>", "provider hint for reports")
  .option("--skip-embeddings", "skip /embeddings test")
  .action(async (options: {
    baseUrl: string;
    model: string;
    name: string;
    apiKeyEnv: string;
    provider?: string;
    skipEmbeddings?: boolean;
  }) => {
    const ctx = await commandContext();
    await ensureDirs(ctx.paths);
    const profile = EndpointProfileSchema.parse({
      name: options.name,
      baseUrl: normalizeBaseUrl(options.baseUrl),
      model: options.model,
      apiKeyEnv: options.apiKeyEnv,
      providerHint: options.provider
    });
    const apiKey = process.env[profile.apiKeyEnv];
    const client = new EndpointClient({ profile, apiKey });
    const results: CapabilityResult[] = [
      await client.testModels(),
      await client.testChat(),
      await client.testStreaming(),
      await client.testTools(false),
      await client.testTools(true),
      await client.testJsonMode(),
      await client.testResponses()
    ];
    if (options.skipEmbeddings !== true) results.push(await client.testEmbeddings());
    const matrix = buildMatrix(profile, results);
    const previous = await readOptionalJsonFile(ctx.paths.matrixJson, MatrixArraySchema) ?? [];
    const matrices = [...previous.filter((item) => item.profile.name !== matrix.profile.name), matrix];
    await writeMatrixAndReport(ctx.paths, ctx.version, matrices);
    printMatrix(matrix);
    if (matrix.summary.decision === "blocked") process.exitCode = 1;
  });

program
  .command("matrix")
  .description("Print the last saved compatibility matrix.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureDirs(ctx.paths);
    const matrices = await readOptionalJsonFile(ctx.paths.matrixJson, MatrixArraySchema) ?? [];
    if (matrices.length === 0) {
      console.log("No matrix yet. Run agent-endpoint-doctor demo or test first.");
      return;
    }
    for (const matrix of matrices) printMatrix(matrix);
  });

program
  .command("config")
  .description("Generate config snippets for common coding-agent clients.")
  .requiredOption("--base-url <url>", "OpenAI-compatible endpoint root ending in /v1")
  .requiredOption("--model <model>", "model ID")
  .option("--api-key-env <name>", "environment variable containing the API key", "OPENAI_COMPATIBLE_API_KEY")
  .action(async (options: { baseUrl: string; model: string; apiKeyEnv: string }) => {
    const ctx = await commandContext();
    await ensureDirs(ctx.paths);
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const snippets = generateSnippets(baseUrl, options.model, options.apiKeyEnv);
    for (const [name, content] of Object.entries(snippets)) {
      await writeTextFile(join(ctx.paths.configsDir, name), content);
    }
    console.log(`Generated snippets in ${ctx.paths.configsDir}`);
  });

program
  .command("report")
  .description("Render JSON, Markdown, and HTML reports from saved matrices.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureDirs(ctx.paths);
    const matrices = await readOptionalJsonFile(ctx.paths.matrixJson, MatrixArraySchema) ?? [];
    await writeMatrixAndReport(ctx.paths, ctx.version, matrices);
    console.log(`JSON: ${ctx.paths.reportJson}`);
    console.log(`Markdown: ${ctx.paths.reportMarkdown}`);
    console.log(`HTML: ${ctx.paths.reportHtml}`);
  });

program
  .command("evidence")
  .description("Write normalized Agent Trust Center evidence from the latest endpoint compatibility matrix.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureDirs(ctx.paths);
    const evidence = await createEndpointTrustEvidence({ paths: ctx.paths, version: ctx.version });
    const outputPath = trustEvidencePath(ctx.paths);
    await writeJsonFile(outputPath, evidence);
    console.log(`Decision: ${evidence.decision.toUpperCase()}`);
    console.log(`Trust evidence: ${outputPath}`);
  });

program.showHelpAfterError();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(`agent-endpoint-doctor: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function commandContext(): Promise<{
  cwd: string;
  version: string;
  paths: ReturnType<typeof resolvePaths>;
}> {
  const options = program.opts<GlobalOptions>();
  const cwd = resolve(options.cwd ?? process.cwd());
  return { cwd, version: await readPackageVersion(), paths: resolvePaths(cwd) };
}

async function readPackageVersion(): Promise<string> {
  try {
    const raw = await readFile(join(packageRoot(), "package.json"), "utf8");
    return z.object({ version: z.string().min(1) }).parse(JSON.parse(raw)).version;
  } catch {
    return "0.1.0";
  }
}

async function loadOfflineMatrix(): Promise<CompatibilityMatrix> {
  const raw = await readFile(join(packageRoot(), "examples", "offline-matrix.json"), "utf8");
  return CompatibilityMatrixSchema.parse(JSON.parse(raw));
}

async function writeMatrixAndReport(
  paths: ReturnType<typeof resolvePaths>,
  version: string,
  matrices: CompatibilityMatrix[]
): Promise<void> {
  const report = buildReport({ version, matrices });
  await Promise.all([
    writeJsonFile(paths.matrixJson, matrices),
    writeJsonFile(paths.reportJson, report),
    writeTextFile(paths.reportMarkdown, renderMarkdown(report)),
    writeTextFile(paths.reportHtml, renderHtml(report))
  ]);
}

function printMatrix(matrix: CompatibilityMatrix): void {
  console.log(`\n${matrix.profile.name}`);
  console.log("-".repeat(matrix.profile.name.length));
  console.log(`Decision: ${matrix.summary.decision.toUpperCase()} | Agent readiness: ${matrix.summary.agentReadinessScore}/100`);
  for (const result of matrix.results) {
    console.log(`[${result.status.toUpperCase()}] ${result.capability}: ${result.message}`);
  }
  for (const finding of matrix.findings) {
    if (finding.status !== "pass") console.log(`-> ${finding.title}: ${finding.recommendation ?? finding.message}`);
  }
}

function generateSnippets(baseUrl: string, model: string, apiKeyEnv: string): Record<string, string> {
  return {
    "continue.yaml": `name: Agent Endpoint Doctor\nversion: 1.0.0\nschema: v1\nmodels:\n  - name: Tested Endpoint\n    provider: openai\n    model: ${model}\n    apiBase: ${baseUrl}\n    apiKey: \${{ env.${apiKeyEnv} }}\n    roles:\n      - chat\n      - edit\n      - apply\n`,
    "litellm.yaml": `model_list:\n  - model_name: tested-agent-model\n    litellm_params:\n      model: openai/${model}\n      api_base: ${baseUrl}\n      api_key: os.environ/${apiKeyEnv}\n`,
    "opencode.json": `${JSON.stringify({
      provider: {
        tested: {
          name: "Tested OpenAI-compatible endpoint",
          type: "openai-compatible",
          baseURL: baseUrl,
          apiKey: `{env:${apiKeyEnv}}`,
          models: {
            [model]: { name: "Tested model" }
          }
        }
      }
    }, null, 2)}\n`
  };
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
