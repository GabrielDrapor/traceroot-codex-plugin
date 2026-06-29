import * as fs from "node:fs/promises";
import type {
  EventMsgPayload, ModelStep, ResponseItem, RolloutLine, SessionMeta, ToolCall, Turn, TurnContextPayload,
} from "./types.js";

export async function readRollout(file: string): Promise<RolloutLine[]> {
  const raw = await fs.readFile(file, "utf-8");
  const lines: RolloutLine[] = [];
  for (const ln of raw.split("\n")) {
    const trimmed = ln.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed) as RolloutLine);
    } catch {
      // skip malformed line, keep going
    }
  }
  return lines;
}

const ms = (ts: string): number => Date.parse(ts);

function reasoningText(p: { summary?: unknown[]; content?: unknown }): string | undefined {
  const parts: string[] = [];
  for (const s of (p.summary ?? []) as Array<{ text?: string }>) if (s?.text) parts.push(s.text);
  if (typeof p.content === "string") parts.push(p.content);
  return parts.length ? parts.join("\n") : undefined;
}

function messageText(content: Array<{ type: string; text?: string }>): string | undefined {
  const parts = content.filter((c) => typeof c.text === "string").map((c) => c.text as string);
  return parts.length ? parts.join("") : undefined;
}

export function parseSession(lines: RolloutLine[]): { sessionMeta: SessionMeta; turns: Turn[] } {
  let sessionMeta: SessionMeta = { sessionId: "" };
  const turns: Turn[] = [];
  let turn: Turn | undefined;
  let step: ModelStep | undefined;
  const toolsByCallId = new Map<string, ToolCall>();

  const ensureStep = (t: Turn, at: number): ModelStep => {
    if (!step) {
      step = { index: t.steps.length, startTime: at, endTime: at, toolCalls: [], reasoning: undefined, text: undefined };
      t.steps.push(step);
    }
    return step;
  };

  for (const line of lines) {
    const at = ms(line.timestamp);
    if (line.type === "session_meta") {
      const p = line.payload as SessionMeta & { id: string; cli_version?: string; model_provider?: string };
      sessionMeta = {
        sessionId: (line.payload as { id: string }).id,
        cwd: (line.payload as { cwd?: string }).cwd,
        cliVersion: (line.payload as { cli_version?: string }).cli_version,
        modelProvider: (line.payload as { model_provider?: string }).model_provider ?? undefined,
      };
      void p;
      continue;
    }

    if (line.type === "turn_context") {
      const p = line.payload as TurnContextPayload;
      if (turn && p.model) turn.model = p.model;
      continue;
    }

    if (line.type === "event_msg") {
      const p = line.payload as EventMsgPayload;
      switch (p.type) {
        case "task_started":
          turn = {
            turnId: p.turn_id ?? undefined, startTime: at, endTime: at,
            steps: [], subagentThreadIds: [], completed: false, aborted: false,
          };
          step = undefined;
          toolsByCallId.clear();
          turns.push(turn);
          break;
        case "user_message":
          if (turn && typeof p.message === "string") turn.userInput = p.message;
          break;
        case "token_count":
          if (turn && p.info?.last_token_usage) {
            const s = ensureStep(turn, at);
            s.usage = p.info.last_token_usage;
            s.endTime = at;
            step = undefined; // close current step
          }
          break;
        case "task_complete":
          if (turn) {
            turn.completed = true;
            turn.endTime = at;
            const lastText = [...turn.steps].reverse().find((s) => s.text)?.text;
            turn.finalOutput = (p.last_agent_message ?? lastText) ?? undefined;
          }
          break;
        default:
          if (turn && typeof p.new_thread_id === "string") turn.subagentThreadIds.push(p.new_thread_id);
      }
      continue;
    }

    if (line.type === "response_item" && turn) {
      const p = line.payload as ResponseItem;
      const s = ensureStep(turn, at);
      if (p.type === "reasoning") {
        s.reasoning = reasoningText(p);
      } else if (p.type === "message") {
        if (p.role !== "developer" && p.role !== "user") s.text = messageText(p.content);
      } else if (p.type === "function_call") {
        let args: unknown = p.arguments;
        try { args = JSON.parse(p.arguments); } catch { /* keep string */ }
        const tc: ToolCall = { callId: p.call_id, name: p.name, args, startTime: at };
        s.toolCalls.push(tc);
        toolsByCallId.set(p.call_id, tc);
      } else if (p.type === "function_call_output") {
        const tc = toolsByCallId.get(p.call_id);
        if (tc) { tc.endTime = at; tc.output = p.output; }
      }
      continue;
    }
  }

  return { sessionMeta, turns };
}
