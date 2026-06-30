import { createHash, randomBytes } from "node:crypto";

function hashHex(input: string, bytes: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, bytes * 2);
}

/** 16-byte (32 hex) trace id, deterministic per (session, turn). */
export function makeTraceId(sessionId: string, turnId: string): string {
  const id = hashHex(`traceroot:codex:trace:${sessionId}:${turnId}`, 16);
  return id === "0".repeat(32) ? "0".repeat(31) + "1" : id;
}

/** 8-byte (16 hex) span id, deterministic per seed. */
export function makeSpanId(seed: string): string {
  const id = hashHex(`traceroot:codex:span:${seed}`, 8);
  return id === "0".repeat(16) ? "0".repeat(15) + "1" : id;
}

/**
 * OTEL IdGenerator that returns a primed id for the very next call, then
 * falls back to random. We prime it immediately before tracer.startSpan() so
 * the new span gets our deterministic id (startSpan consumes the generator
 * synchronously). Root spans consume both trace+span id; child spans inherit
 * the trace id from the parent context and consume only the span id.
 */
export class PrimedIdGenerator {
  nextTraceId?: string;
  nextSpanId?: string;

  generateTraceId(): string {
    const v = this.nextTraceId ?? randomBytes(16).toString("hex");
    this.nextTraceId = undefined;
    return v;
  }

  generateSpanId(): string {
    const v = this.nextSpanId ?? randomBytes(8).toString("hex");
    this.nextSpanId = undefined;
    return v;
  }
}
