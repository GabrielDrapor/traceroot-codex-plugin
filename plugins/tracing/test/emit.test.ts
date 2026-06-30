import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildTracingWith } from "../src/exporter.js";
import { PrimedIdGenerator } from "../src/ids.js";
import { dispatch } from "../src/emit.js";
import type { Config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const config: Config = {
  enabled: true, apiKey: "tr-x", hostUrl: "http://x", maxChars: 20000, debug: false, failOnError: true,
};

let dir: string;
afterEach(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

async function copyFixture(): Promise<string> {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-emit-"));
  const dst = path.join(dir, "rollout.jsonl");
  await fs.copyFile(path.join(here, "fixtures", "rollout-basic.jsonl"), dst);
  return dst;
}

describe("dispatch", () => {
  it("emits AGENT+LLM+TOOL once, and is idempotent on a second run", async () => {
    const transcript = await copyFixture();
    const mem = new InMemorySpanExporter();
    // dispatch() calls tracing.shutdown() internally, and provider.shutdown()
    // clears InMemorySpanExporter. Override shutdown with a no-op so the
    // exporter retains the spans for assertions (SimpleSpanProcessor already
    // exported them on span.end()).
    const deps = {
      buildTracing: () => ({
        ...buildTracingWith(new SimpleSpanProcessor(mem), new PrimedIdGenerator()),
        shutdown: async () => {},
      }),
      getGit: async () => ({ repo: "traceroot-ai/traceroot", ref: "a".repeat(40) }),
    };

    const r1 = await dispatch({ transcript_path: transcript }, config, deps);
    expect(r1.emitted).toBe(3);
    expect(mem.getFinishedSpans()).toHaveLength(3);

    const r2 = await dispatch({ transcript_path: transcript }, config, deps);
    expect(r2.emitted).toBe(0); // sidecar dedup
  });

  it("live: emits completed tool+llm before the turn closes, root only after task_complete", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-live-"));
    const transcript = path.join(dir, "rollout.jsonl");
    await fs.copyFile(path.join(here, "fixtures", "rollout-inprogress.jsonl"), transcript);

    const mem = new InMemorySpanExporter();
    // no-op shutdown so the InMemory exporter keeps spans across dispatch() calls
    // (dispatch calls provider.shutdown() internally, which would clear it).
    const deps = {
      buildTracing: () => ({
        ...buildTracingWith(new SimpleSpanProcessor(mem), new PrimedIdGenerator()),
        shutdown: async () => {},
      }),
      getGit: async () => ({}),
    };

    const r1 = await dispatch({ transcript_path: transcript }, config, deps);
    expect(r1.emitted).toBe(2); // LLM + TOOL, no AGENT root yet
    expect(mem.getFinishedSpans().map((s) => s.attributes["traceroot.span.type"]).sort())
      .toEqual(["LLM", "TOOL"]);

    // Now the turn completes: append task_complete and re-run.
    await fs.appendFile(transcript,
      '{"timestamp":"2026-06-23T23:21:36.100Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1","last_agent_message":"done","completed_at":1782256896}}\n');
    const r2 = await dispatch({ transcript_path: transcript }, config, deps);
    expect(r2.emitted).toBe(1); // only the AGENT root now
  });
});
