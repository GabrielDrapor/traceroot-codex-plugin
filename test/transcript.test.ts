import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSession, readRollout } from "../src/transcript.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "rollout-basic.jsonl");

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
});
