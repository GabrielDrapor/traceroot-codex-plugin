import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Walk the Codex sessions directory for a rollout file named
 * `rollout-<ts>-<threadId>.jsonl`.  Returns the first match or undefined.
 * Fail-soft: returns undefined on any fs error.
 *
 * To bound cost we scan only the newest ~3 day-directories under
 * sessions/YYYY/MM/DD rather than the full tree.
 */
export async function locateSubagentRollout(
  threadId: string,
  codexHome?: string,
): Promise<string | undefined> {
  try {
    const home = codexHome ?? process.env["CODEX_HOME"] ?? path.join(os.homedir(), ".codex");
    const sessionsRoot = path.join(home, "sessions");

    // Collect candidate day-directories: sessions/YYYY/MM/DD
    const dayDirs = await collectRecentDayDirs(sessionsRoot, 3);

    for (const dayDir of dayDirs) {
      const entries = await fs.readdir(dayDir).catch(() => [] as string[]);
      for (const name of entries) {
        if (name.endsWith(`-${threadId}.jsonl`)) {
          return path.join(dayDir, name);
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Return up to `max` most-recent day-level dirs under sessionsRoot/YYYY/MM/DD. */
async function collectRecentDayDirs(sessionsRoot: string, max: number): Promise<string[]> {
  const result: string[] = [];

  let years: string[];
  try {
    years = (await fs.readdir(sessionsRoot)).sort().reverse();
  } catch {
    return result;
  }

  for (const year of years) {
    const yearDir = path.join(sessionsRoot, year);
    let months: string[];
    try {
      months = (await fs.readdir(yearDir)).sort().reverse();
    } catch {
      continue;
    }

    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      let days: string[];
      try {
        days = (await fs.readdir(monthDir)).sort().reverse();
      } catch {
        continue;
      }

      for (const day of days) {
        result.push(path.join(monthDir, day));
        if (result.length >= max) return result;
      }
    }
  }

  return result;
}
