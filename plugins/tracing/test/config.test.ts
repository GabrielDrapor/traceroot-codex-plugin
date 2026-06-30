import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";

const saved = { ...process.env };
beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith("TRACE")) delete process.env[k];
});
afterEach(() => { process.env = { ...saved }; });

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
