import type { LlmClient } from "../llm/LlmClient.js";
import type { MemoryStore } from "../memory/MemoryStore.js";
import { InMemoryStore } from "../memory/MemoryStore.js";
import { ToolRegistry, defaultTools } from "../tools/registry.js";
import {
  AgentError,
  type AgentConfig,
  type AgentErrorCode,
  type AgentEvent,
  type Message,
  type ToolCall,
  type ToolResult,
} from "./types.js";

export class Agent {
  private readonly tools: ToolRegistry;
  private readonly memory: MemoryStore;
  private readonly maxTurns: number;
  private readonly toolTimeoutMs: number | undefined;
  private readonly systemPrompt: string;
  private readonly signal: AbortSignal | undefined;

  constructor(
    private readonly llm: LlmClient,
    config: AgentConfig = {},
    memory?: MemoryStore,
  ) {
    this.tools = new ToolRegistry(config.tools ?? defaultTools());
    this.memory = memory ?? new InMemoryStore();
    this.maxTurns = config.maxTurns ?? 6;
    this.toolTimeoutMs = config.toolTimeoutMs;
    this.signal = config.signal;
    this.systemPrompt =
      config.systemPrompt ??
      "You are a careful assistant. Use tools when they improve accuracy.";
  }

  async run(userInput: string, opts?: { signal?: AbortSignal }): Promise<Message> {
    let final: Message | undefined;
    for await (const event of this.stream(userInput, opts)) {
      if (event.type === "final") final = event.message;
      if (event.type === "error") {
        throw new AgentError(
          (event.code as AgentErrorCode) ?? "LLM_ERROR",
          event.error,
        );
      }
    }
    if (!final) throw new AgentError("LLM_ERROR", "Agent finished without a final message");
    return final;
  }

  async *stream(
    userInput: string,
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<AgentEvent> {
    const signal = opts?.signal ?? this.signal;
    const history = await this.memory.list();
    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      ...history,
      { role: "user", content: userInput },
    ];
    await this.memory.append([{ role: "user", content: userInput }]);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      if (signal?.aborted) {
        yield {
          type: "error",
          error: "Agent run aborted",
          code: "ABORTED",
        };
        return;
      }

      yield { type: "turn_start", turn };

      let response;
      try {
        response = await this.llm.complete({
          messages,
          tools: this.tools.list(),
        });
      } catch (err) {
        yield {
          type: "error",
          error: err instanceof Error ? err.message : String(err),
          code: "LLM_ERROR",
        };
        return;
      }

      if (response.text) {
        yield { type: "assistant_text", text: response.text };
      }

      const toolCalls = response.toolCalls ?? [];
      if (toolCalls.length === 0) {
        const final: Message = {
          role: "assistant",
          content: response.text ?? "",
        };
        messages.push(final);
        await this.memory.append([final]);
        yield { type: "final", message: final };
        return;
      }

      const assistantWithTools: Message = {
        role: "assistant",
        content: response.text ?? "",
      };
      messages.push(assistantWithTools);
      await this.memory.append([assistantWithTools]);

      for (const call of toolCalls) {
        if (signal?.aborted) {
          yield {
            type: "error",
            error: "Agent run aborted",
            code: "ABORTED",
          };
          return;
        }
        yield { type: "tool_call", call };
        const result = await this.executeTool(call);
        yield { type: "tool_result", result };
        const toolMessage: Message = {
          role: "tool",
          name: result.name,
          toolCallId: result.toolCallId,
          content: result.ok
            ? JSON.stringify(result.output)
            : `ERROR: ${result.error ?? "unknown"}`,
        };
        messages.push(toolMessage);
        await this.memory.append([toolMessage]);
      }
    }

    yield {
      type: "error",
      error: `Exceeded maxTurns (${this.maxTurns})`,
      code: "MAX_TURNS",
    };
  }

  private async executeTool(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        ok: false,
        output: null,
        error: `Unknown tool: ${call.name}`,
      };
    }
    try {
      const output = await this.withTimeout(
        Promise.resolve(tool.execute(call.arguments)),
        this.toolTimeoutMs,
        call.name,
      );
      return { toolCallId: call.id, name: call.name, ok: true, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        toolCallId: call.id,
        name: call.name,
        ok: false,
        output: null,
        error: message,
      };
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    toolName: string,
  ): Promise<T> {
    if (timeoutMs === undefined || timeoutMs <= 0) return promise;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new AgentError(
            "TOOL_TIMEOUT",
            `Tool "${toolName}" timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
