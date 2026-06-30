import * as fs from "node:fs/promises";

const suffix = ".traceroot";

export async function loadEmittedSpanIds(rolloutFile: string): Promise<Set<string>> {
  try {
    const data = await fs.readFile(`${rolloutFile}${suffix}`, "utf-8");
    return new Set(data.split("\n").filter(Boolean));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }
}

export async function markSpanEmitted(rolloutFile: string, spanId: string): Promise<void> {
  try {
    await fs.appendFile(`${rolloutFile}${suffix}`, `${spanId}\n`, "utf-8");
  } catch {
    // Best-effort: a failed write only risks a duplicate emit next time.
  }
}
