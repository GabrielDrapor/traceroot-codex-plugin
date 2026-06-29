import { describe, expect, it, vi } from "vitest";

vi.mock("../src/util.js", async (orig) => {
  const actual = await orig<typeof import("../src/util.js")>();
  return { ...actual, readStdin: vi.fn(async () => ({})) };
});

describe("runHook", () => {
  it("returns without throwing when disabled", async () => {
    const { runHook } = await import("../src/index.js");
    await expect(runHook()).resolves.toBeUndefined();
  });
});
