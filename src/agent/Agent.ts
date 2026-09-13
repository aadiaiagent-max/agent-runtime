import type { LlmClient } from "../llm/LlmClient.js";
import type { MemoryStore } from "../memory/MemoryStore.js";
import { InMemoryStore } from "../memory/MemoryStore.js";
import { ToolRegistry, defaultTools } from "../tools/registry.js";
import type {
  AgentConfig,
  AgentEvent,
  Message,
  ToolCall,
  ToolResult,
} from "./types.js";

export class Agent {
  private readonly tools: ToolRegistry;
  private readonly memory: MemoryStore;
  private readonly maxTurns: number;
  private readonly systemPrompt: string;

  constructor(
    private readonly llm: LlmClient,
    config: AgentConfig = {},
    memory?: MemoryStore,
  ) {
    this.tools = new ToolRegistry(config.tools ?? defaultTools());
    this.memory = memory ?? new InMemoryStore();
    this.maxTurns = config.maxTurns ?? 6;
    this.systemPrompt =
      config.systemPrompt ??
      "You are a careful assistant. Use tools when they improve accuracy.";
  }

  async run(userInput: string): Promise<Message> {
    let final: Message | undefined;
    for await (const event of this.stream(userInput)) {
      if (event.type === "final") final = event.message;
      if (event.type === "error") throw new Error(event.error);
    }
    if (!final) throw new Error("Agent finished without a final message");
    return final;
  }

  async *stream(userInput: string): AsyncGenerator<AgentEvent> {
    const history = await this.memory.list();
    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      ...history,
      { role: "user", content: userInput },
    ];
    await this.memory.append([{ role: "user", content: userInput }]);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      yield { type: "turn_start", turn };

      let response;
      try {
        response = await this.llm.complete({
          messages,
          tools: this.tools.list(),
        });
      } catch (err) {
        yield { type: "error", error: err instanceof Error ? err.message : String(err) };
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

    yield { type: "error", error: `Exceeded maxTurns (${this.maxTurns})` };
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
      const output = await tool.execute(call.arguments);
      return { toolCallId: call.id, name: call.name, ok: true, output };
    } catch (err) {
      return {
        toolCallId: call.id,
        name: call.name,
        ok: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
