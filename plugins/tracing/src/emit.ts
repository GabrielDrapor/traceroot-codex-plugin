import type { Config } from "./config.js";
import { buildTracing as defaultBuildTracing, type Tracing } from "./exporter.js";
import { getGitContext } from "./git.js";
import { makeSpanId, makeTraceId } from "./ids.js";
import { loadEmittedSpanIds, markSpanEmitted } from "./sidecar.js";
import { emitSpan, planTurnSpans, type EmitCtx, type PlanOpts } from "./spans.js";
import { findSubagentRollout } from "./subagents.js";
import { parseSession, readRollout } from "./transcript.js";
import type { HookInput, SessionMeta, Turn } from "./types.js";
import { debugLog } from "./util.js";

// Paranoia guard only; the visited-set is the real recursion bound.
const STACK_GUARD = 32;

export type Deps = {
  buildTracing: (c: Config) => Tracing;
  getGit: (cwd: string) => Promise<{ repo?: string; ref?: string }>;
  findSubagent: (threadId: string) => Promise<string | undefined>;
};

/** Emit all complete, not-yet-seen spans for `turn` and recurse into its subagents. */
async function emitTurnTree(
  sessionMeta: SessionMeta,
  turn: Turn,
  ctx: EmitCtx,
  opts: PlanOpts,
  visited: Set<string>,
  depth: number,
  tracing: Tracing,
  already: Set<string>,
  emittedIds: string[],
  deps: Deps,
): Promise<number> {
  let n = 0;

  for (const span of planTurnSpans(sessionMeta, turn, ctx, opts)) {
    if (!span.complete || already.has(span.spanId)) continue;
    emitSpan(tracing, span);
    emittedIds.push(span.spanId);
    already.add(span.spanId);
    n++;
  }

  if (depth >= STACK_GUARD) {
    debugLog(`subagent recursion hit STACK_GUARD at depth ${depth}; stopping`);
    return n;
  }

  // Determine the traceId and seed prefix that were used for this turn.
  const parentSeed = opts.seedPrefix ?? "";
  const traceId = opts.traceId ?? makeTraceId(sessionMeta.sessionId, turn.turnId ?? "");

  for (const sub of turn.subagents ?? []) {
    if (!sub.spawnCallId) continue;
    if (visited.has(sub.threadId)) continue; // cycle/diamond guard
    visited.add(sub.threadId);

    const childPath = await deps.findSubagent(sub.threadId);
    if (!childPath) continue; // child rollout not on disk yet — try again next hook

    let childLines;
    try {
      childLines = await readRollout(childPath);
    } catch {
      continue;
    }
    const child = parseSession(childLines);

    const childOpts: PlanOpts = {
      traceId,                                          // SAME trace as parent
      rootParentSpanId: makeSpanId(parentSeed + sub.spawnCallId), // nest under spawn TOOL span
      seedPrefix: sub.threadId + ":",                   // unique, stable child span ids
    };

    for (const childTurn of child.turns) {
      n += await emitTurnTree(
        child.sessionMeta, childTurn, ctx, childOpts, visited, depth + 1,
        tracing, already, emittedIds, deps,
      );
    }
  }

  return n;
}

export async function dispatch(
  hook: HookInput, config: Config, deps?: Partial<Deps>,
): Promise<{ emitted: number }> {
  const transcript = hook.transcript_path;
  if (!transcript) { debugLog("no transcript_path; skipping"); return { emitted: 0 }; }

  const buildTracingFn = deps?.buildTracing ?? defaultBuildTracing;
  const getGit = deps?.getGit ?? getGitContext;
  const findSubagentFn = deps?.findSubagent ?? findSubagentRollout;

  const lines = await readRollout(transcript);
  const { sessionMeta, turns } = parseSession(lines);
  const cwd = sessionMeta.cwd ?? hook.cwd ?? process.cwd();
  const git = await getGit(cwd).catch(() => ({}));
  const ctx: EmitCtx = { environment: config.environment, userId: config.userId, git, maxChars: config.maxChars };

  const already = await loadEmittedSpanIds(transcript);
  const tracing = buildTracingFn(config);
  let emitted = 0;
  const emittedIds: string[] = [];

  // One visited set per dispatch so a thread referenced from multiple turns is emitted once.
  const visited = new Set<string>();

  const resolvedDeps: Deps = {
    buildTracing: buildTracingFn,
    getGit,
    findSubagent: findSubagentFn,
  };

  try {
    for (const turn of turns) {
      emitted += await emitTurnTree(
        sessionMeta, turn, ctx, {}, visited, 0,
        tracing, already, emittedIds, resolvedDeps,
      );
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
