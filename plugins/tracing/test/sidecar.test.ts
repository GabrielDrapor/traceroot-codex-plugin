import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEmittedSpanIds, markSpanEmitted } from "../src/sidecar.js";

let dir: string;
afterEach(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

describe("sidecar", () => {
  it("returns empty set when no sidecar file", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-"));
    const f = path.join(dir, "rollout.jsonl");
    expect((await loadEmittedSpanIds(f)).size).toBe(0);
  });

  it("round-trips emitted ids", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-"));
    const f = path.join(dir, "rollout.jsonl");
    await markSpanEmitted(f, "span-a");
    await markSpanEmitted(f, "span-b");
    const ids = await loadEmittedSpanIds(f);
    expect(ids.has("span-a")).toBe(true);
    expect(ids.has("span-b")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("fails open (empty set) on a non-ENOENT read error", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-"));
    const f = path.join(dir, "rollout.jsonl");
    // Make the sidecar path a directory so readFile throws EISDIR (not ENOENT).
    // The whole plugin is fail-open: an unreadable sidecar must degrade to
    // "nothing emitted yet", never abort emission.
    await fs.mkdir(`${f}.traceroot`);
    const ids = await loadEmittedSpanIds(f);
    expect(ids.size).toBe(0);
  });
});
