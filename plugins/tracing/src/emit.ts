import type { Config } from "./config.js";
import { buildTracing as defaultBuildTracing, type Tracing } from "./exporter.js";
import { getGitContext } from "./git.js";
import { loadEmittedSpanIds, markSpanEmitted } from "./sidecar.js";
import { emitSpan, planTurnSpans } from "./spans.js";
import { parseSession, readRollout } from "./transcript.js";
import type { HookInput } from "./types.js";
import { debugLog } from "./util.js";

export type Deps = {
  buildTracing: (c: Config) => Tracing;
  getGit: (cwd: string) => Promise<{ repo?: string; ref?: string }>;
};

export async function dispatch(
  hook: HookInput, config: Config, deps?: Partial<Deps>,
): Promise<{ emitted: number }> {
  const transcript = hook.transcript_path;
  if (!transcript) { debugLog("no transcript_path; skipping"); return { emitted: 0 }; }

  const buildTracingFn = deps?.buildTracing ?? defaultBuildTracing;
  const getGit = deps?.getGit ?? getGitContext;

  const lines = await readRollout(transcript);
  const { sessionMeta, turns } = parseSession(lines);
  const cwd = sessionMeta.cwd ?? hook.cwd ?? process.cwd();
  const git = await getGit(cwd).catch(() => ({}));
  const ctx = { environment: config.environment, userId: config.userId, git, maxChars: config.maxChars };

  const already = await loadEmittedSpanIds(transcript);
  const tracing = buildTracingFn(config);
  let emitted = 0;
  const emittedIds: string[] = [];
  try {
    for (const turn of turns) {
      for (const span of planTurnSpans(sessionMeta, turn, ctx)) {
        if (!span.complete || already.has(span.spanId)) continue;
        emitSpan(tracing, span);
        emittedIds.push(span.spanId);
        already.add(span.spanId);
        emitted += 1;
      }
    }
  } finally {
    await tracing.shutdown();
  }
  for (const id of emittedIds) {
    await markSpanEmitted(transcript, id);
  }
  debugLog(`emitted ${emitted} spans`);
  return { emitted };
}
