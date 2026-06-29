let DEBUG = false;
export function setDebug(b: boolean): void { DEBUG = b; }
export function debugLog(...args: unknown[]): void {
  if (DEBUG) console.error("[traceroot-codex]", ...args);
}

export async function readStdin<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return JSON.parse(raw || "{}") as T;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated ${s.length - max} chars]`;
}
