import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import { PrimedIdGenerator } from "../src/ids.js";
import { buildTracingWith } from "../src/exporter.js";

describe("buildTracingWith", () => {
  it("produces a tracer whose spans reach the processor's exporter", async () => {
    const mem = new InMemorySpanExporter();
    const idGen = new PrimedIdGenerator();
    const { tracer, shutdown } = buildTracingWith(new SimpleSpanProcessor(mem), idGen);

    const span = tracer.startSpan("hello");
    span.end();

    // With SimpleSpanProcessor the span is in the exporter right after end();
    // assert before shutdown() (shutdown clears InMemorySpanExporter's buffer).
    const spans = mem.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("hello");

    await shutdown();
  });

  it("uses primed deterministic ids", async () => {
    const mem = new InMemorySpanExporter();
    const idGen = new PrimedIdGenerator();
    const { tracer, shutdown } = buildTracingWith(new SimpleSpanProcessor(mem), idGen);

    idGen.nextTraceId = "a".repeat(32);
    idGen.nextSpanId = "b".repeat(16);
    tracer.startSpan("root").end();

    const s = mem.getFinishedSpans()[0]!;
    expect(s.spanContext().traceId).toBe("a".repeat(32));
    expect(s.spanContext().spanId).toBe("b".repeat(16));

    await shutdown();
  });
});
