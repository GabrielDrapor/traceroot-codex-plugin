import { describe, expect, it } from "vitest";
import type { RolloutLine, Turn } from "../src/types.js";

describe("types", () => {
  it("RolloutLine discriminates on type", () => {
    const line: RolloutLine = {
      timestamp: "2026-06-23T23:21:32.926Z",
      type: "session_meta",
      payload: { id: "sess-1" },
    };
    expect(line.type).toBe("session_meta");
  });

  it("Turn carries steps and subagent ids", () => {
    const t: Turn = {
      startTime: 0, endTime: 1, steps: [], subagentThreadIds: [],
      completed: true, aborted: false,
    };
    expect(t.steps).toHaveLength(0);
  });
});
