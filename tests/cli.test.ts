import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("cli", () => {
  it("runs offline demo from a clean folder", async () => {
    const cwd = process.cwd();
    const temp = await mkdtemp(join(tmpdir(), "endpoint-doctor-"));
    const tsx = join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
    const result = await execFileAsync(process.execPath, [tsx, "src/cli.ts", "--cwd", temp, "demo"], { cwd });
    expect(result.stdout).toContain("offline-localhost-demo");
    const report = await readFile(join(temp, ".endpoint-doctor", "reports", "endpoint-doctor-report.md"), "utf8");
    expect(report).toContain("agent-endpoint-doctor Report");
  }, 30_000);
});
