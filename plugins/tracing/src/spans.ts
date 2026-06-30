import { ROOT_CONTEXT, type SpanContext, SpanKind, TraceFlags, trace } from "@opentelemetry/api";
import type { Tracing } from "./exporter.js";
import { makeSpanId, makeTraceId } from "./ids.js";
import { mapUsage } from "./tokens.js";
import type { ModelStep, SessionMeta, ToolCall, Turn } from "./types.js";
import { truncate } from "./util.js";

export type EmitCtx = {
  environment?: string;
  userId?: string;
  git?: { repo?: string; ref?: string };
  maxChars: number;
};

export type EmittableSpan = {
  spanId: string;
  parentSpanId: string | null;
  traceId: string;
  kind: "AGENT" | "LLM" | "TOOL";
  name: string;
  startTime: number;
  endTime: number;
  attributes: Record<string, string | number>;
  complete: boolean;
};

const str = (v: unknown, max: number): string =>
  truncate(typeof v === "string" ? v : JSON.stringify(v ?? ""), max);

function commonTrace(attrs: Record<string, string | number>, sessionMeta: SessionMeta, ctx: EmitCtx): void {
  // Child subagent spans intentionally carry the CHILD session id here (sessionMeta is
  // the child's own SessionMeta). The trace still groups correctly because the backend
  // keys a trace's session off the ROOT (parent) span, not the children. A future
  // `overrideSessionId` field on PlanOpts would be the clean way to force the parent's
  // session id onto child spans if grouping ever needs it — not implemented now.
  attrs["traceroot.trace.session_id"] = sessionMeta.sessionId;
  if (ctx.userId) attrs["traceroot.trace.user_id"] = ctx.userId;
  if (ctx.environment) attrs["traceroot.environment"] = ctx.environment;
}

export type PlanOpts = {
  traceId?: string;
  rootParentSpanId?: string | null;
  seedPrefix?: string;
};

export function planTurnSpans(sessionMeta: SessionMeta, turn: Turn, ctx: EmitCtx, opts?: PlanOpts): EmittableSpan[] {
  if (!turn.turnId) return [];
  // When opts is undefined, seed="" so every id is byte-identical to the pre-opts baseline.
  const seed = opts?.seedPrefix ?? "";
  const traceId = opts?.traceId ?? makeTraceId(sessionMeta.sessionId, turn.turnId);
  const rootId = makeSpanId(seed + turn.turnId + ":root");
  const rootParentSpanId = opts?.rootParentSpanId !== undefined ? opts.rootParentSpanId : null;
  const out: EmittableSpan[] = [];

  // Root AGENT span (trace-level attrs live here).
  const rootAttrs: Record<string, string | number> = { "traceroot.span.type": "AGENT" };
  commonTrace(rootAttrs, sessionMeta, ctx);
  if (turn.userInput) rootAttrs["traceroot.span.input"] = str(turn.userInput, ctx.maxChars);
  if (turn.finalOutput) rootAttrs["traceroot.span.output"] = str(turn.finalOutput, ctx.maxChars);
  rootAttrs["traceroot.span.metadata"] = JSON.stringify(pruneUndefined({
    "codex.turn_id": turn.turnId,
    "codex.thread_id": sessionMeta.sessionId,
    "codex.model": turn.model,
    "codex.model_provider": sessionMeta.modelProvider,
    "codex.cli_version": sessionMeta.cliVersion,
    "codex.tool_call_count": turn.steps.reduce((n, s) => n + s.toolCalls.length, 0),
  }));
  if (ctx.git?.repo) rootAttrs["traceroot.git.repo"] = ctx.git.repo;
  if (ctx.git?.ref) rootAttrs["traceroot.git.ref"] = ctx.git.ref;
  out.push({
    spanId: rootId, parentSpanId: rootParentSpanId, traceId, kind: "AGENT",
    name: "Codex Turn", startTime: turn.startTime, endTime: turn.endTime,
    attributes: rootAttrs, complete: turn.completed,
  });

  // LLM-step input is the user prompt (first step) or the prior step's tool
  // results fed back to the model (continuation steps) — like the conversation
  // the model actually saw.
  let prevToolResults: string | undefined;
  for (const step of turn.steps) {
    const stepId = makeSpanId(seed + turn.turnId + ":step:" + step.index);
    const input = step.index === 0 ? turn.userInput : prevToolResults;
    out.push(planStepSpan(sessionMeta, turn, step, stepId, rootId, traceId, ctx, input));
    for (const tc of step.toolCalls) out.push(planToolSpan(sessionMeta, tc, seed, stepId, traceId, ctx));
    if (step.toolCalls.length) {
      prevToolResults = str(step.toolCalls.map((tc) => ({ name: tc.name, output: tc.output })), ctx.maxChars);
    }
  }
  return out;
}

function pruneUndefined(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) r[k] = v;
  return r;
}

/** LLM-step output: text + reasoning + the tool calls the model requested. */
function buildStepOutput(step: ModelStep, max: number): string | undefined {
  const o: Record<string, unknown> = {};
  if (step.text) o.content = step.text;
  if (step.reasoning) o.reasoning = step.reasoning;
  if (step.toolCalls.length) o.tool_calls = step.toolCalls.map((tc) => ({ name: tc.name, args: tc.args }));
  if (Object.keys(o).length === 0) return undefined;
  return truncate(JSON.stringify(o), max);
}

function planStepSpan(
  sessionMeta: SessionMeta, turn: Turn, step: ModelStep,
  spanId: string, parentSpanId: string, traceId: string, ctx: EmitCtx, input: string | undefined,
): EmittableSpan {
  const attrs: Record<string, string | number> = { "traceroot.span.type": "LLM" };
  commonTrace(attrs, sessionMeta, ctx);
  if (turn.model) attrs["traceroot.llm.model"] = turn.model;
  if (input) attrs["traceroot.span.input"] = truncate(input, ctx.maxChars);
  const output = buildStepOutput(step, ctx.maxChars);
  if (output) attrs["traceroot.span.output"] = output;
  attrs["traceroot.span.metadata"] = JSON.stringify({ "codex.step_index": step.index });
  Object.assign(attrs, mapUsage(step.usage));
  return {
    spanId, parentSpanId, traceId, kind: "LLM",
    name: turn.model ?? "model", startTime: step.startTime, endTime: step.endTime,
    attributes: attrs, complete: Boolean(step.usage),
  };
}

function planToolSpan(
  sessionMeta: SessionMeta, tc: ToolCall, seed: string, parentSpanId: string, traceId: string, ctx: EmitCtx,
): EmittableSpan {
  const attrs: Record<string, string | number> = { "traceroot.span.type": "TOOL" };
  commonTrace(attrs, sessionMeta, ctx);
  attrs["traceroot.span.input"] = str(tc.args, ctx.maxChars);
  if (tc.output !== undefined) attrs["traceroot.span.output"] = str(tc.output, ctx.maxChars);
  const meta: Record<string, unknown> = {};
  if (tc.kind !== undefined) meta["tool_kind"] = tc.kind;
  if (tc.status !== undefined) meta["status"] = tc.status;
  if (tc.exitCode !== undefined) meta["exit_code"] = tc.exitCode;
  if (tc.error !== undefined) meta["error"] = tc.error;
  if (Object.keys(meta).length > 0) attrs["traceroot.span.metadata"] = JSON.stringify(meta);
  return {
    spanId: makeSpanId(seed + tc.callId), parentSpanId, traceId, kind: "TOOL",
    name: tc.name, startTime: tc.startTime, endTime: tc.endTime ?? tc.startTime,
    attributes: attrs, complete: tc.endTime !== undefined,
  };
}

const KIND: Record<EmittableSpan["kind"], SpanKind> = {
  AGENT: SpanKind.INTERNAL, LLM: SpanKind.CLIENT, TOOL: SpanKind.INTERNAL,
};

export function emitSpan(tracing: Tracing, s: EmittableSpan): void {
  let ctx = ROOT_CONTEXT;
  if (s.parentSpanId) {
    const parent: SpanContext = {
      traceId: s.traceId, spanId: s.parentSpanId, traceFlags: TraceFlags.SAMPLED, isRemote: false,
    };
    ctx = trace.setSpanContext(ROOT_CONTEXT, parent);
  } else {
    tracing.idGen.nextTraceId = s.traceId;
  }
  tracing.idGen.nextSpanId = s.spanId;
  const span = tracing.tracer.startSpan(
    s.name, { startTime: s.startTime, kind: KIND[s.kind], attributes: s.attributes }, ctx,
  );
  span.end(s.endTime);
}
