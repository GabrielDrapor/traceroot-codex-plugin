import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export type Config = {
  enabled: boolean;
  apiKey?: string;
  hostUrl: string;
  environment?: string;
  userId?: string;
  maxChars: number;
  debug: boolean;
  failOnError: boolean;
};

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function envFirst(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");

export async function getConfig(cwd: string = process.cwd()): Promise<Config> {
  const globalJson = await readJson(path.join(codexHome, "traceroot.json"));
  const projectJson = await readJson(path.join(cwd, ".codex", "traceroot.json"));
  const j = { ...globalJson, ...projectJson };

  const truthy = (v: unknown) => v === true || v === "true" || v === "1";

  const enabledFlag =
    envFirst("TRACE_TO_TRACEROOT") ?? (j.enabled !== undefined ? String(j.enabled) : undefined);
  const apiKey = envFirst("TRACEROOT_CODEX_API_KEY", "TRACEROOT_API_KEY") ?? (j.api_key as string | undefined);

  const config: Config = {
    apiKey,
    hostUrl:
      envFirst("TRACEROOT_CODEX_HOST_URL", "TRACEROOT_HOST_URL") ??
      (j.host_url as string | undefined) ??
      "https://app.traceroot.ai",
    environment: envFirst("TRACEROOT_ENVIRONMENT") ?? (j.environment as string | undefined),
    userId: envFirst("TRACEROOT_CODEX_USER_ID") ?? (j.user_id as string | undefined),
    maxChars: (n => Number.isFinite(n) ? n : 20000)(Number(envFirst("TRACEROOT_CODEX_MAX_CHARS") ?? j.max_chars ?? 20000)),
    debug: truthy(envFirst("TRACEROOT_CODEX_DEBUG") ?? j.debug),
    failOnError: truthy(envFirst("TRACEROOT_CODEX_FAIL_ON_ERROR") ?? j.fail_on_error),
    enabled: false,
  };
  config.enabled = truthy(enabledFlag) && Boolean(apiKey);
  return config;
}
