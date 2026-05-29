import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DoctorPaths {
  cwd: string;
  packageRoot: string;
  stateDir: string;
  cacheDir: string;
  reportsDir: string;
  configsDir: string;
  matrixJson: string;
  reportJson: string;
  reportMarkdown: string;
  reportHtml: string;
}

export function packageRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return dirname(dirname(moduleDir));
}

export function resolvePaths(cwd = process.cwd()): DoctorPaths {
  const stateDir = join(cwd, ".endpoint-doctor");
  const cacheDir = join(stateDir, "cache");
  const reportsDir = join(stateDir, "reports");
  const configsDir = join(stateDir, "configs");
  return {
    cwd,
    packageRoot: packageRoot(),
    stateDir,
    cacheDir,
    reportsDir,
    configsDir,
    matrixJson: join(reportsDir, "compatibility-matrix.json"),
    reportJson: join(reportsDir, "endpoint-doctor-report.json"),
    reportMarkdown: join(reportsDir, "endpoint-doctor-report.md"),
    reportHtml: join(reportsDir, "endpoint-doctor-report.html")
  };
}

export async function ensureDirs(paths: DoctorPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.stateDir, { recursive: true }),
    mkdir(paths.cacheDir, { recursive: true }),
    mkdir(paths.reportsDir, { recursive: true }),
    mkdir(paths.configsDir, { recursive: true })
  ]);
}
