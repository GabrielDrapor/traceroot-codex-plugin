import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { locateSubagentRollout } from "../src/subagents.js";

let tmpDir: string;
afterEach(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

async function makeTmpCodexHome(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-subagents-"));
  return tmpDir;
}

describe("locateSubagentRollout", () => {
  it("returns the rollout path when the file exists under sessions/YYYY/MM/DD/", async () => {
    const home = await makeTmpCodexHome();
    const dayDir = path.join(home, "sessions", "2026", "06", "30");
    await fs.mkdir(dayDir, { recursive: true });
    const filePath = path.join(dayDir, "rollout-1782294000000-child-thread-1.jsonl");
    await fs.writeFile(filePath, "");

    const result = await locateSubagentRollout("child-thread-1", home);
    expect(result).toBe(filePath);
  });

  it("returns undefined when no matching file exists", async () => {
    const home = await makeTmpCodexHome();
    const dayDir = path.join(home, "sessions", "2026", "06", "30");
    await fs.mkdir(dayDir, { recursive: true });
    await fs.writeFile(path.join(dayDir, "rollout-1782294000000-other-thread.jsonl"), "");

    const result = await locateSubagentRollout("child-thread-1", home);
    expect(result).toBeUndefined();
  });

  it("returns undefined and does not throw when the sessions directory does not exist", async () => {
    const home = await makeTmpCodexHome();
    // No sessions/ directory created
    const result = await locateSubagentRollout("any-thread", home);
    expect(result).toBeUndefined();
  });

  it("finds a file in a nested day directory among multiple day dirs", async () => {
    const home = await makeTmpCodexHome();
    // Create two day dirs — target in the newer one
    const olderDir = path.join(home, "sessions", "2026", "06", "28");
    const newerDir = path.join(home, "sessions", "2026", "06", "30");
    await fs.mkdir(olderDir, { recursive: true });
    await fs.mkdir(newerDir, { recursive: true });
    const targetPath = path.join(newerDir, "rollout-1782294001-target-thread.jsonl");
    await fs.writeFile(targetPath, "");

    const result = await locateSubagentRollout("target-thread", home);
    expect(result).toBe(targetPath);
  });
});
