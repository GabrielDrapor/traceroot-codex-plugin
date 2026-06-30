# traceroot-codex-plugin

Trace OpenAI Codex sessions to [TraceRoot](https://traceroot.ai). Every query becomes **one live trace** — agent turn, model calls, tool calls, file edits, and any subagents it spawns — streamed as the agent works and linked to your git repo. No daemon; tracing never blocks Codex.

## Install

```bash
codex plugin marketplace add traceroot-ai/traceroot-codex-plugin
```

Enable it in `~/.codex/config.toml`:

```toml
plugin_hooks = true

[plugins."tracing@traceroot-codex-plugin"]
enabled = true
```

## Configure

Add `~/.codex/traceroot.json` — that's all that's required:

```json
{
  "enabled": true,
  "api_key": "your-key-from-app.traceroot.ai"
}
```

Get your API key at [app.traceroot.ai](https://app.traceroot.ai). (The plugin runs as a Codex hook, which doesn't reliably inherit your shell environment, so the config file is preferred over environment variables.)

<details>
<summary>Optional settings</summary>

Resolved highest-precedence first: env vars → project `.codex/traceroot.json` → global `~/.codex/traceroot.json` → defaults.

| JSON key | Env var | Default | Notes |
|----------|---------|---------|-------|
| `enabled` | `TRACE_TO_TRACEROOT` | `false` | Turn tracing on (an API key must also be set). |
| `api_key` | `TRACEROOT_API_KEY` | — | Required. |
| `host_url` | `TRACEROOT_HOST_URL` | `https://app.traceroot.ai` | Point at a self-hosted instance. |
| `max_chars` | `TRACEROOT_CODEX_MAX_CHARS` | `20000` | Truncate long span attributes. |
| `debug` | `TRACEROOT_CODEX_DEBUG` | `false` | Log to stderr. |
| `fail_on_error` | `TRACEROOT_CODEX_FAIL_ON_ERROR` | `false` | Off by default — tracing never blocks a Codex turn. |

</details>

## Privacy

Only what appears in your traces is sent to your TraceRoot host: prompts, tool inputs/outputs (which can include commands and file contents), model and token info, and git repo/branch. If your tools handle secrets, their inputs/outputs are part of the trace.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
