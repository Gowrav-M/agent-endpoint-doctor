import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

export async function readJsonFile<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const raw = await readFile(path, "utf8");
  return schema.parse(JSON.parse(raw));
}

export async function readOptionalJsonFile<T extends z.ZodType>(
  path: string,
  schema: T
): Promise<z.infer<T> | undefined> {
  try {
    return await readJsonFile(path, schema);
  } catch {
    return undefined;
  }
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
