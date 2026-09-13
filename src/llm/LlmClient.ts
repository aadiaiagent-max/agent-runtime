import type { Message, Tool, ToolCall } from "../agent/types.js";

export interface LlmResponse {
  text?: string;
  toolCalls?: ToolCall[];
}

export interface LlmClient {
  complete(input: {
    messages: Message[];
    tools: Tool[];
  }): Promise<LlmResponse>;
}

/**
 * Deterministic mock for demos and tests — no API key required.
 * First turn: call the calculator tool if the user mentions math/add.
 * Second turn: return a final answer incorporating tool output.
 */
export class MockLlmClient implements LlmClient {
  private turn = 0;

  async complete(input: {
    messages: Message[];
    tools: Tool[];
  }): Promise<LlmResponse> {
    this.turn += 1;
    const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
    const lastTool = [...input.messages].reverse().find((m) => m.role === "tool");

    if (this.turn === 1 && lastUser && /add|plus|\+|\d/.test(lastUser.content)) {
      const nums = lastUser.content.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [2, 2];
      const a = nums[0] ?? 2;
      const b = nums[1] ?? 2;
      const hasCalc = input.tools.some((t) => t.name === "calculator");
      if (hasCalc) {
        return {
          text: "I'll use the calculator tool.",
          toolCalls: [
            {
              id: "call_calc_1",
              name: "calculator",
              arguments: { expression: `${a} + ${b}` },
            },
          ],
        };
      }
    }

    if (lastTool) {
      return {
        text: `The result is ${String(lastTool.content)}.`,
      };
    }

    return {
      text: lastUser
        ? `Echo: ${lastUser.content}`
        : "Hello from MockLlmClient.",
    };
  }
}

/** Thin OpenAI-compatible stub — wire your fetch/SDK here for production. */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly opts: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async complete(input: {
    messages: Message[];
    tools: Tool[];
  }): Promise<LlmResponse> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const baseUrl = this.opts.baseUrl ?? "https://api.openai.com/v1";
    const model = this.opts.model ?? "gpt-4o-mini";

    const body = {
      model,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      tools: input.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: "object",
            properties: Object.fromEntries(
              t.parameters.map((p) => [
                p.name,
                { type: p.type, description: p.description },
              ]),
            ),
            required: t.parameters.filter((p) => p.required !== false).map((p) => p.name),
          },
        },
      })),
    };

    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = json.choices?.[0]?.message;
    const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
    }));

    return {
      text: message?.content ?? undefined,
      toolCalls,
    };
  }
}
