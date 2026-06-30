import { describe, expect, it } from "vitest";
import { runHook } from "../src/index.js";

describe("scaffold", () => {
  it("exports runHook", () => {
    expect(typeof runHook).toBe("function");
  });
});
