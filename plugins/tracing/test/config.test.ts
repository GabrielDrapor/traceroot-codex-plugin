import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";

const saved = { ...process.env };
let tmpHome: string;
beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith("TRACE")) delete process.env[k];
  // Isolate from the real ~/.codex/traceroot.json so the test doesn't read the
  // developer's actual global config.
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tr-codexhome-"));
  process.env.CODEX_HOME = tmpHome;
});
afterEach(() => {
  process.env = { ...saved };
  if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("getConfig", () => {
  it("disabled by default without keys", async () => {
    const c = await getConfig();
    expect(c.enabled).toBe(false);
    expect(c.hostUrl).toBe("https://app.traceroot.ai");
    expect(c.maxChars).toBe(20000);
  });

  it("enabled when TRACE_TO_TRACEROOT=true and key present", async () => {
    process.env.TRACE_TO_TRACEROOT = "true";
    process.env.TRACEROOT_API_KEY = "tr-abc";
    const c = await getConfig();
    expect(c.enabled).toBe(true);
    expect(c.apiKey).toBe("tr-abc");
  });

  it("TRACEROOT_CODEX_* overrides plain TRACEROOT_*", async () => {
    process.env.TRACE_TO_TRACEROOT = "true";
    process.env.TRACEROOT_API_KEY = "plain";
    process.env.TRACEROOT_CODEX_API_KEY = "codex";
    const c = await getConfig();
    expect(c.apiKey).toBe("codex");
  });
});
