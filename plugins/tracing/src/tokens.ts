import type { TokenUsage } from "./types.js";

/**
 * Map Codex `last_token_usage` to the backend's flat token attribute keys.
 * Codex `input_tokens` is GROSS (includes cached); the backend subtracts
 * cache_read to derive the uncached input bucket, so we pass it straight
 * through. Codex exposes no cache-write concept, so that key is omitted.
 */
export function mapUsage(u: TokenUsage | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!u) return out;
  if (typeof u.input_tokens === "number") out["llm.token_count.prompt"] = u.input_tokens;
  if (typeof u.output_tokens === "number") out["llm.token_count.completion"] = u.output_tokens;
  if (typeof u.cached_input_tokens === "number")
    out["llm.token_count.prompt_details.cache_read"] = u.cached_input_tokens;
  if (typeof u.reasoning_output_tokens === "number")
    out["llm.token_count.completion_details.reasoning"] = u.reasoning_output_tokens;
  return out;
}
