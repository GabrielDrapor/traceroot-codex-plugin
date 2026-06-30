# traceroot-codex-plugin

Trace OpenAI Codex sessions to [Traceroot](https://traceroot.ai). Each Codex query becomes **one trace** — agent turn, model calls, tool executions, and any subagents it spawns — **streamed live** as the agent works, linked to your git repo.

- **One trace per query.** A query and everything it does (model steps, tool calls, file edits, subagents) is a single trace. Multiple queries in a session are linked by session id (Traceroot's **Sessions** view).
- **Live.** Spans appear and the trace grows as the agent runs — you don't wait for it to finish. The trace is named `Codex Turn` from the first span.
- **Subagents nested.** When Codex delegates to parallel workers (`spawn_agent`), each subagent's full execution is nested **under the spawn tool that created it**, in the same trace.
- **No daemon.** Stateless one-shot hooks. Nothing runs in the background; tracing never blocks a Codex operation (fail-open).

## Installation

Install from the Codex plugin marketplace:

```bash
codex plugin marketplace add traceroot-ai/traceroot-codex-plugin
```

Then enable it in `~/.codex/config.toml`:

```toml
plugin_hooks = true

[plugins."tracing@traceroot-codex-plugin"]
enabled = true
```

## Configuration

The plugin runs as a Codex **hook subprocess**, which does not reliably inherit your shell environment. The **recommended setup is a config file**, `~/.codex/traceroot.json`:

```json
{
  "enabled": true,
  "api_key": "your-api-key-from-app.traceroot.ai"
}
```

Get your API key at [app.traceroot.ai](https://app.traceroot.ai). That's all that's required.

### All settings

Settings are resolved in this order (highest precedence first): **environment variables → project `.codex/traceroot.json` → global `~/.codex/traceroot.json` → built-in defaults.** When the same key is set in both a project and a global file, the project file wins. (Environment variables are supported but only take effect if Codex passes them to the hook — prefer the config file.)

| Setting | Env var | JSON key | Default | Notes |
|---------|---------|----------|---------|-------|
| **Master enable** | `TRACE_TO_TRACEROOT` | `enabled` | `false` | Must be true **and** an API key present for tracing to run. |
| **API key** | `TRACEROOT_API_KEY` | `api_key` | — | Required. `TRACEROOT_CODEX_API_KEY` overrides the plain form when both are set. |
| **Host URL** | `TRACEROOT_HOST_URL` | `host_url` | `https://app.traceroot.ai` | Point at a self-hosted instance if needed. `TRACEROOT_CODEX_HOST_URL` overrides the plain form. |
| **Max span size** | `TRACEROOT_CODEX_MAX_CHARS` | `max_chars` | `20000` | Span attributes longer than this are truncated. |
| **Debug logging** | `TRACEROOT_CODEX_DEBUG` | `debug` | `false` | Logs to stderr; helps diagnose config/network/emission. |
| **Fail on error** | `TRACEROOT_CODEX_FAIL_ON_ERROR` | `fail_on_error` | `false` | By default a tracing error never blocks a Codex turn. |

## What gets captured

- **Agent turn** (`Codex Turn`) — the query prompt and final answer, with git repo/ref and model.
- **Model calls** — each model step with its input (prompt or prior tool results), output (text + reasoning summary + the tool calls it requested), token counts, and cost (priced by the backend, cache-aware).
- **Tool executions** — `exec_command` (bash), `apply_patch` (file edits), MCP tools, web/tool search, etc., with arguments, output, and — where Codex reports it — exit code, status, and tool kind.
- **Subagents** — `spawn_agent` workers, fully nested under their spawn tool in the same trace.

### What is (and isn't) sent

Only what appears in the trace is sent to your configured Traceroot host: turn prompts/answers, tool inputs/outputs (which can include commands and file contents), model/token info, and git repo/branch. Nothing outside the trace is sent. If your tools handle secrets, be aware their inputs/outputs are part of the trace.

## How it works

Stateless Codex hooks (`PostToolUse`, `Stop`, `SubagentStop`) read the live rollout transcript on disk and emit OpenTelemetry spans to Traceroot. Each hook invocation:

1. Reads the Codex rollout transcript,
2. Reconstructs the turn (model steps, tool calls, subagent spawns),
3. Emits any newly-complete spans, using **deterministic span ids** so a child span can reference its parent before the parent exists and re-emitting is idempotent (a sidecar ledger, `<rollout>.traceroot`, tracks what's been sent),
4. Never blocks Codex (fail-open).

`PostToolUse` drives the live streaming (a span lands as each tool completes); `Stop` finalizes the turn; `SubagentStop` re-walks the parent so a just-finished subagent's spans land promptly. There is no daemon — each hook call is independent.

### Debug

```bash
export TRACEROOT_CODEX_DEBUG=true   # or "debug": true in traceroot.json
```

Debug messages go to stderr.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
