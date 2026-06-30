/**
 * Tests for planTurnSpans with PlanOpts — proves the behavior-preserving refactor
 * (opts=undefined gives byte-identical ids) and the subagent-under-parent embedding.
 */
import { describe, expect, it } from "vitest";
import { planTurnSpans } from "../src/spans.js";
import { makeSpanId, makeTraceId } from "../src/ids.js";
import type { SessionMeta, Turn } from "../src/types.js";

const sessionMeta: SessionMeta = { sessionId: "sess-opts" };
const turn: Turn = {
  turnId: "opts-turn-1", startTime: 2000, endTime: 5000, model: "gpt-5.5",
  userInput: "hello", finalOutput: "world", completed: true, aborted: false,
  steps: [{
    index: 0, startTime: 2500, endTime: 4000,
    text: "world",
    usage: { input_tokens: 100, output_tokens: 20 },
    toolCalls: [{ callId: "tc-1", name: "exec", args: {}, startTime: 2600, endTime: 3800, output: "ok" }],
  }],
};
const ctx = { maxChars: 20000 };

describe("planTurnSpans — opts=undefined is byte-identical to no-opts baseline", () => {
  it("ids match when opts is undefined vs not passed", () => {
    const withoutOpts = planTurnSpans(sessionMeta, turn, ctx);
    const withUndefined = planTurnSpans(sessionMeta, turn, ctx, undefined);
    // Every span id and traceId must be identical
    expect(withUndefined.map((s) => s.spanId)).toEqual(withoutOpts.map((s) => s.spanId));
    expect(withUndefined.map((s) => s.traceId)).toEqual(withoutOpts.map((s) => s.traceId));
    expect(withUndefined.map((s) => s.parentSpanId)).toEqual(withoutOpts.map((s) => s.parentSpanId));
  });

  it("root uses makeTraceId(sessionId, turnId) when no opts", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx);
    const expected = makeTraceId("sess-opts", "opts-turn-1");
    expect(spans.every((s) => s.traceId === expected)).toBe(true);
  });

  it("root spanId equals makeSpanId(turnId+:root) when no opts", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx);
    const root = spans.find((s) => s.kind === "AGENT")!;
    expect(root.spanId).toBe(makeSpanId("opts-turn-1:root"));
    expect(root.parentSpanId).toBeNull();
  });

  it("tool spanId equals makeSpanId(callId) when no opts", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx);
    const tool = spans.find((s) => s.kind === "TOOL")!;
    expect(tool.spanId).toBe(makeSpanId("tc-1"));
  });
});

describe("planTurnSpans — opts inject traceId, rootParentSpanId, seedPrefix", () => {
  const injectedTraceId = "a".repeat(32);
  const injectedParent = "b".repeat(16);
  const seed = "child-thread-x:";
  const opts = { traceId: injectedTraceId, rootParentSpanId: injectedParent, seedPrefix: seed };

  it("all spans share the injected traceId", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx, opts);
    expect(spans.every((s) => s.traceId === injectedTraceId)).toBe(true);
  });

  it("root span uses the injected parentSpanId", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx, opts);
    const root = spans.find((s) => s.kind === "AGENT")!;
    expect(root.parentSpanId).toBe(injectedParent);
  });

  it("root spanId is prefixed with seedPrefix", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx, opts);
    const root = spans.find((s) => s.kind === "AGENT")!;
    expect(root.spanId).toBe(makeSpanId(seed + "opts-turn-1:root"));
    // must differ from the un-prefixed version
    expect(root.spanId).not.toBe(makeSpanId("opts-turn-1:root"));
  });

  it("tool spanId is prefixed with seedPrefix", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx, opts);
    const tool = spans.find((s) => s.kind === "TOOL")!;
    expect(tool.spanId).toBe(makeSpanId(seed + "tc-1"));
    expect(tool.spanId).not.toBe(makeSpanId("tc-1"));
  });

  it("rootParentSpanId=null keeps root parentSpanId null", () => {
    const spans = planTurnSpans(sessionMeta, turn, ctx, { rootParentSpanId: null });
    const root = spans.find((s) => s.kind === "AGENT")!;
    expect(root.parentSpanId).toBeNull();
  });
});
