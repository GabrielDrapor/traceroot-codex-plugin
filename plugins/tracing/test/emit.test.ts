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
    // The trace root re-emits every dispatch (so the trace stays named "Codex
    // Turn" with a refreshed end/output); the LLM+TOOL spans dedup via sidecar.
    expect(r2.emitted).toBe(1);
  });

  it("live: trace root + completed tool/llm emit before the turn closes; root refreshes on completion", async () => {
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
    // Trace root (named "Codex Turn") emits immediately for live naming, plus the
    // already-complete LLM step and its TOOL — before the turn closes.
    expect(r1.emitted).toBe(3);
    expect(mem.getFinishedSpans().map((s) => s.attributes["traceroot.span.type"]).sort())
      .toEqual(["AGENT", "LLM", "TOOL"]);

    // Now the turn completes: append task_complete and re-run. The root re-emits
    // (refreshed end + finalOutput); LLM/TOOL already emitted (sidecar dedup).
    await fs.appendFile(transcript,
      '{"timestamp":"2026-06-23T23:21:36.100Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1","last_agent_message":"done","completed_at":1782256896}}\n');
    const r2 = await dispatch({ transcript_path: transcript }, config, deps);
    expect(r2.emitted).toBe(1); // the AGENT root re-emitted
  });

  it("skips standalone emission for a subagent session (it nests under its parent)", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-sub-"));
    const transcript = path.join(dir, "rollout.jsonl");
    // A subagent session: session_meta marks thread_source=subagent + parent_thread_id.
    const lines = [
      '{"timestamp":"2026-06-30T00:00:00.000Z","type":"session_meta","payload":{"id":"child-1","thread_source":"subagent","parent_thread_id":"parent-1"}}',
      '{"timestamp":"2026-06-30T00:00:01.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"ct1"}}',
      '{"timestamp":"2026-06-30T00:00:02.000Z","type":"turn_context","payload":{"turn_id":"ct1","model":"gpt-5.5"}}',
      '{"timestamp":"2026-06-30T00:00:03.000Z","type":"response_item","payload":{"type":"function_call","call_id":"x1","name":"exec_command","arguments":"{}"}}',
      '{"timestamp":"2026-06-30T00:00:04.000Z","type":"response_item","payload":{"type":"function_call_output","call_id":"x1","output":"ok"}}',
      '{"timestamp":"2026-06-30T00:00:05.000Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"output_tokens":1}}}}',
      '{"timestamp":"2026-06-30T00:00:06.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"ct1"}}',
    ].join("\n");
    await fs.writeFile(transcript, lines);
    const mem = new InMemorySpanExporter();
    const deps = {
      buildTracing: () => ({ ...buildTracingWith(new SimpleSpanProcessor(mem), new PrimedIdGenerator()), shutdown: async () => {} }),
      getGit: async () => ({}),
    };
    const r = await dispatch({ transcript_path: transcript }, config, deps);
    expect(r.emitted).toBe(0); // suppressed — parent owns the nesting
    expect(mem.getFinishedSpans()).toHaveLength(0);
  });
});
