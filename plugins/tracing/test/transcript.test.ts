import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSession, readRollout } from "../src/transcript.js";
import type { RolloutLine } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "rollout-basic.jsonl");
const toolDetailFixture = path.join(here, "fixtures", "rollout-tool-detail.jsonl");

const ts = (sec: number): string => new Date(sec * 1000).toISOString();

describe("parseSession", () => {
  it("reconstructs one completed turn with a tool call and usage", async () => {
    const lines = await readRollout(fixture);
    const { sessionMeta, turns } = parseSession(lines);

    expect(sessionMeta.sessionId).toBe("sess-abc");
    expect(turns).toHaveLength(1);

    const t = turns[0]!;
    expect(t.turnId).toBe("turn-1");
    expect(t.model).toBe("gpt-5.5");
    expect(t.userInput).toBe("list the files");
    expect(t.completed).toBe(true);
    expect(t.finalOutput).toContain("two files");
    expect(t.steps).toHaveLength(1);

    const step = t.steps[0]!;
    expect(step.usage?.input_tokens).toBe(1200);
    expect(step.text).toContain("two files");
    expect(step.reasoning).toContain("ls");
    expect(step.toolCalls).toHaveLength(1);

    const tc = step.toolCalls[0]!;
    expect(tc.name).toBe("exec_command");
    expect(tc.callId).toBe("call-1");
    expect(tc.output).toContain("a.txt");
    expect(tc.endTime).toBeGreaterThan(tc.startTime);
  });

  it("does not throw and leaves text undefined when message content is missing", () => {
    const lines: RolloutLine[] = [
      { timestamp: ts(100), type: "session_meta", payload: { id: "sess-1" } },
      { timestamp: ts(101), type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } },
      { timestamp: ts(102), type: "response_item", payload: { type: "message", role: "assistant" } as never },
      { timestamp: ts(103), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 5 } } } },
      { timestamp: ts(104), type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1" } },
    ];

    const { turns } = parseSession(lines);
    expect(turns).toHaveLength(1);
    const t = turns[0]!;
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0]!.text).toBeUndefined();
  });

  it("enriches tool calls from *_end event_msg events", async () => {
    const lines = await readRollout(toolDetailFixture);
    const { turns } = parseSession(lines);
    expect(turns).toHaveLength(1);
    const t = turns[0]!;
    expect(t.steps).toHaveLength(1);
    const toolCalls = t.steps[0]!.toolCalls;
    expect(toolCalls).toHaveLength(2);

    // (a) successful exec
    const tcOk = toolCalls.find((tc) => tc.callId === "call-ok")!;
    expect(tcOk).toBeDefined();
    expect((tcOk as { kind?: string }).kind).toBe("exec");
    expect((tcOk as { status?: string }).status).toBe("completed");
    expect((tcOk as { exitCode?: number }).exitCode).toBe(0);
    expect(tcOk.endTime).toBeTruthy();
    expect(tcOk.error).toBeUndefined();

    // (b) failed exec
    const tcFail = toolCalls.find((tc) => tc.callId === "call-fail")!;
    expect(tcFail).toBeDefined();
    expect((tcFail as { kind?: string }).kind).toBe("exec");
    expect((tcFail as { status?: string }).status).toBe("failed");
    expect((tcFail as { exitCode?: number }).exitCode).toBe(1);
    expect(tcFail.endTime).toBeTruthy();
    expect(tcFail.error).toContain("boom");
  });

  it("attaches function_call_output arriving after token_count without spawning an empty step", () => {
    const lines: RolloutLine[] = [
      { timestamp: ts(200), type: "session_meta", payload: { id: "sess-2" } },
      { timestamp: ts(201), type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } },
      { timestamp: ts(202), type: "response_item", payload: { type: "function_call", name: "exec", call_id: "c1", arguments: "{}" } },
      // token_count closes the step BEFORE the tool output arrives (real Codex ordering)
      { timestamp: ts(203), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 7 } } } },
      { timestamp: ts(204), type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: "done" } },
      { timestamp: ts(205), type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1" } },
    ];

    const { turns } = parseSession(lines);
    expect(turns).toHaveLength(1);
    const t = turns[0]!;
    // Only the one step holding the function_call — no empty step from the late output.
    expect(t.steps).toHaveLength(1);
    const tc = t.steps[0]!.toolCalls[0]!;
    expect(tc.callId).toBe("c1");
    expect(tc.output).toBe("done");
    expect(tc.endTime).toBeGreaterThan(tc.startTime);
  });
});
