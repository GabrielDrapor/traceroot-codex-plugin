# traceroot-codex-plugin

Trace OpenAI Codex sessions to Traceroot. Streams each Codex query as a trace: agent turns, model calls, tool executions, token usage, and subagents — live, one trace per query, linked to your git repo.

## Installation

Install the plugin from the Codex plugin marketplace:

```bash
codex plugin marketplace add traceroot-ai/traceroot-codex-plugin
```

Then enable it in your `~/.codex/config.toml`:

```toml
plugin_hooks = true

[plugins."tracing@traceroot-codex-plugin"]
enabled = true
```

## Configuration

Configure Traceroot API access via environment variables, project `.codex/traceroot.json`, or global `~/.codex/traceroot.json`. Settings are resolved in this order (highest precedence first):

1. Environment variables
2. Project `.codex/traceroot.json`
3. Global `~/.codex/traceroot.json`
4. Built-in defaults

When the same key is set in both a project and a global `traceroot.json`, the project file wins.

| Setting | Env Var | JSON Key | Default | Required | Notes |
|---------|---------|----------|---------|----------|-------|
| **Master enable** | `TRACE_TO_TRACEROOT` | `enabled` | — | Yes | Set to `true` to enable tracing. Plugin also requires `TRACEROOT_API_KEY` to be set. |
| **API key** | `TRACEROOT_API_KEY` | `api_key` | — | Yes | Obtain from [app.traceroot.ai](https://app.traceroot.ai). The Codex-scoped `TRACEROOT_CODEX_API_KEY` takes precedence over `TRACEROOT_API_KEY` when both are set. |
| **Host URL** | `TRACEROOT_HOST_URL` | `host_url` | `https://app.traceroot.ai` | No | Point to your self-hosted Traceroot instance if needed. The Codex-scoped `TRACEROOT_CODEX_HOST_URL` takes precedence over `TRACEROOT_HOST_URL` when both are set. |
| **Max span size** | `TRACEROOT_CODEX_MAX_CHARS` | `max_chars` | `20000` | No | Maximum characters in a span attribute before truncation. |
| **Debug logging** | `TRACEROOT_CODEX_DEBUG` | `debug` | `false` | No | Set to `true` to see debug output. |
| **Fail on error** | `TRACEROOT_CODEX_FAIL_ON_ERROR` | `fail_on_error` | `false` | No | Set to `true` to fail a Codex turn if tracing fails. By default, tracing errors never block Codex. |

### Example Configuration

**Global `~/.codex/traceroot.json`:**

```json
{
  "host_url": "https://app.traceroot.ai",
  "max_chars": 20000
}
```

**Project `.codex/traceroot.json`:**

```json
{
  "debug": true
}
```

**Environment variables (highest precedence):**

```bash
export TRACE_TO_TRACEROOT=true
export TRACEROOT_API_KEY=your-api-key-here
```

## What Gets Sent

Only the data that appears in your traces is sent to the configured Traceroot host:

- Agent turns and tool calls (prompts, inputs, outputs)
- Model names and token counts
- Git repository and branch information
- Span IDs, timing, and status

No code, files, or any data outside the trace is sent.

## How It Works

The plugin uses stateless Codex hooks (`PostToolUse`, `Stop`, `SubagentStop`) to read the live rollout transcript. For each hook invocation, it:

1. Reads the Codex transcript from disk
2. Extracts spans (agent turns, model calls, tool use, subagents)
3. Emits OpenTelemetry spans to your Traceroot instance
4. Never blocks a Codex operation (fail-open design)

There is no daemon or persistent process. Each hook call is independent and non-blocking.

### Debug Mode

Enable debug logging to see what the plugin is doing:

```bash
export TRACEROOT_CODEX_DEBUG=true
```

Debug messages appear on stderr and help diagnose configuration, network, or span-emission issues.

## Sessions and Traces

Each Codex query generates one trace. Multiple queries in a session are linked by session ID (visible in Traceroot's Sessions view). Each trace is linked to your git repository and current branch.

## License

Apache License 2.0 — see LICENSE file for details.
