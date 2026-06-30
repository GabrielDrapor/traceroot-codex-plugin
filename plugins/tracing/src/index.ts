import { getConfig } from "./config.js";
import { dispatch } from "./emit.js";
import type { HookInput } from "./types.js";
import { debugLog, readStdin, setDebug } from "./util.js";

export async function runHook(): Promise<void> {
  let hook: HookInput;
  try {
    hook = await readStdin<HookInput>();
  } catch {
    return; // no/invalid stdin — nothing to do
  }

  const config = await getConfig(hook.cwd);
  setDebug(config.debug);

  if (!config.enabled) {
    debugLog("tracing disabled (set TRACE_TO_TRACEROOT=true and TRACEROOT_API_KEY)");
    return;
  }
  if (!hook.transcript_path) {
    debugLog("hook payload missing transcript_path; skipping");
    return;
  }

  try {
    await dispatch(hook, config);
  } catch (error) {
    debugLog("dispatch failed:", error);
    if (config.failOnError) throw error;
  }
}

// Self-invoke when executed as the bundled hook entry.
runHook().catch((error) => {
  if (process.env.TRACEROOT_CODEX_DEBUG === "true") console.error("[traceroot-codex] fatal:", error);
  if (process.env.TRACEROOT_CODEX_FAIL_ON_ERROR === "true") process.exitCode = 1;
});
