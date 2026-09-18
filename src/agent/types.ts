export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolParameter {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "object";
  required?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  ok: boolean;
  output: unknown;
  error?: string;
}

export type AgentErrorCode = "MAX_TURNS" | "ABORTED" | "TOOL_TIMEOUT" | "LLM_ERROR";

export class AgentError extends Error {
  readonly code: AgentErrorCode;

  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

export interface AgentConfig {
  systemPrompt?: string;
  /** Maximum LLM turns (tool rounds + final) before stopping. Default: 6. */
  maxTurns?: number;
  /** Per-tool execution timeout in ms. When set, slow tools fail with TOOL_TIMEOUT. */
  toolTimeoutMs?: number;
  tools?: Tool[];
  /** Optional abort signal to cancel mid-loop. */
  signal?: AbortSignal;
}

export type AgentEvent =
  | { type: "turn_start"; turn: number }
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; result: ToolResult }
  | { type: "final"; message: Message }
  | { type: "error"; error: string; code?: AgentErrorCode };
