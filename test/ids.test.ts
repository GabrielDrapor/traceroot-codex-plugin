import { describe, expect, it } from "vitest";
import { PrimedIdGenerator, makeSpanId, makeTraceId } from "../src/ids.js";

describe("ids", () => {
  it("trace id is 32 hex chars and deterministic", () => {
    const a = makeTraceId("sess", "turn");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(makeTraceId("sess", "turn"));
    expect(a).not.toBe(makeTraceId("sess", "turn2"));
  });

  it("span id is 16 hex chars, deterministic, never all-zero", () => {
    const a = makeSpanId("call_1");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(makeSpanId("call_1"));
    expect(a).not.toBe(makeSpanId("call_2"));
  });

  it("PrimedIdGenerator returns primed values then falls back to random", () => {
    const g = new PrimedIdGenerator();
    g.nextTraceId = "a".repeat(32);
    g.nextSpanId = "b".repeat(16);
    expect(g.generateTraceId()).toBe("a".repeat(32));
    expect(g.generateSpanId()).toBe("b".repeat(16));
    // After consumption, returns fresh random ids of valid length.
    expect(g.generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(g.generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });
});
