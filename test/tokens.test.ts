import { describe, expect, it } from "vitest";
import { mapUsage } from "../src/tokens.js";

describe("mapUsage", () => {
  it("maps Codex usage to backend token keys (gross input incl. cache)", () => {
    const out = mapUsage({
      input_tokens: 15142,
      cached_input_tokens: 11136,
      output_tokens: 357,
      reasoning_output_tokens: 139,
      total_tokens: 15499,
    });
    expect(out).toEqual({
      "llm.token_count.prompt": 15142,
      "llm.token_count.completion": 357,
      "llm.token_count.prompt_details.cache_read": 11136,
      "llm.token_count.completion_details.reasoning": 139,
    });
  });

  it("returns empty object for undefined usage", () => {
    expect(mapUsage(undefined)).toEqual({});
  });
});
