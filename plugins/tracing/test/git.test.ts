import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getGitContext, normalizeRepo } from "../src/git.js";

let dir: string;
afterEach(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

describe("normalizeRepo", () => {
  it("normalizes ssh and https remotes to owner/repo", () => {
    expect(normalizeRepo("git@github.com:traceroot-ai/traceroot.git")).toBe("traceroot-ai/traceroot");
    expect(normalizeRepo("https://github.com/traceroot-ai/traceroot.git")).toBe("traceroot-ai/traceroot");
  });
  it("returns undefined for junk", () => {
    expect(normalizeRepo("not-a-url")).toBeUndefined();
  });
});

describe("getGitContext", () => {
  it("reads repo + ref from a real git dir", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-git-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/traceroot-ai/traceroot.git"], { cwd: dir });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "x"], { cwd: dir });
    const ctx = await getGitContext(dir);
    expect(ctx.repo).toBe("traceroot-ai/traceroot");
    expect(ctx.ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns empty for a non-git dir", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-nogit-"));
    expect(await getGitContext(dir)).toEqual({});
  });
});
