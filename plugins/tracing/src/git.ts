import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function normalizeRepo(remote: string): string | undefined {
  const m = remote.trim().match(/(?:github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?$/i);
  return m ? m[1] : undefined;
}

export async function getGitContext(cwd: string): Promise<{ repo?: string; ref?: string }> {
  const out: { repo?: string; ref?: string } = {};
  try {
    const { stdout } = await run("git", ["remote", "get-url", "origin"], { cwd });
    out.repo = normalizeRepo(stdout);
  } catch {
    // no remote
  }
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd });
    const ref = stdout.trim();
    if (/^[0-9a-f]{40}$/.test(ref)) out.ref = ref;
  } catch {
    // not a git repo
  }
  return out;
}
