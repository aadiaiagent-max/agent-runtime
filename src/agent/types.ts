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

export interface AgentConfig {
  systemPrompt?: string;
  maxTurns?: number;
  tools?: Tool[];
}

export type AgentEvent =
  | { type: "turn_start"; turn: number }
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; result: ToolResult }
  | { type: "final"; message: Message }
  | { type: "error"; error: string };
