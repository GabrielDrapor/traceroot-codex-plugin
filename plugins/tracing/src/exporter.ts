import type { Tracer } from "@opentelemetry/api";
// Protobuf exporter (Content-Type: application/x-protobuf). The Traceroot ingest
// endpoint /api/v1/public/traces accepts OTLP protobuf ONLY (it 415s JSON), and
// the traceroot-ts SDK uses this same proto exporter — keep them aligned.
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import {
  type SpanProcessor, BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { Config } from "./config.js";
import { PrimedIdGenerator } from "./ids.js";

const SDK_NAME = "traceroot-codex-plugin";
const SDK_VERSION = "0.1.0";

export type Tracing = { tracer: Tracer; idGen: PrimedIdGenerator; shutdown: () => Promise<void> };

export function buildTracingWith(processor: SpanProcessor, idGen: PrimedIdGenerator): Tracing {
  const provider = new NodeTracerProvider({ idGenerator: idGen, spanProcessors: [processor] });
  return {
    tracer: provider.getTracer(SDK_NAME, SDK_VERSION),
    idGen,
    // Both needed: forceFlush drains pending spans, shutdown awaits in-flight
    // OTLP HTTP delivery so this short-lived process delivers spans before exit.
    shutdown: async () => {
      await provider.forceFlush();
      await provider.shutdown();
    },
  };
}

export function buildTracing(config: Config): Tracing {
  const exporter = new OTLPTraceExporter({
    url: `${config.hostUrl}/api/v1/public/traces`,
    headers: {
      Authorization: `Bearer ${config.apiKey ?? ""}`,
      "x-traceroot-sdk-name": SDK_NAME,
      "x-traceroot-sdk-version": SDK_VERSION,
    },
    compression: "gzip" as never,
  });
  // Batch (not Simple): a hook invocation can complete many spans at once (a turn
  // with many tools, or a subagent's whole subtree). Simple sends one HTTP POST
  // per span, and a burst loses the tail before this short-lived process exits.
  // Batch coalesces them into few large OTLP POSTs that forceFlush ships reliably.
  // Liveness is unchanged: each hook invocation still flushes its spans on shutdown.
  const processor = new BatchSpanProcessor(exporter, {
    maxQueueSize: 4096,
    maxExportBatchSize: 1024,
    scheduledDelayMillis: 30000, // won't auto-fire in a short hook; we forceFlush on shutdown
  });
  return buildTracingWith(processor, new PrimedIdGenerator());
}
