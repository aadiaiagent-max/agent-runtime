import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent/Agent.js";
import { AgentError } from "../src/agent/types.js";
import type { LlmClient, LlmResponse } from "../src/llm/LlmClient.js";
import { MockLlmClient } from "../src/llm/LlmClient.js";
import { collectEvents } from "../src/streaming/events.js";
import type { Tool } from "../src/agent/types.js";

/** Always requests a tool call so the agent never finishes naturally. */
class EndlessToolLlm implements LlmClient {
  private n = 0;
  async complete(): Promise<LlmResponse> {
    this.n += 1;
    return {
      text: `turn ${this.n}`,
      toolCalls: [
        {
          id: `call_${this.n}`,
          name: "echo",
          arguments: { message: `ping-${this.n}` },
        },
      ],
    };
  }
}

describe("Agent", () => {
  it("runs a tool then returns a final answer", async () => {
    const agent = new Agent(new MockLlmClient());
    const final = await agent.run("Please add 21 + 21");
    expect(final.role).toBe("assistant");
    expect(final.content).toMatch(/42/);
  });

  it("emits turn, tool, and final events", async () => {
    const agent = new Agent(new MockLlmClient());
    const events = await collectEvents(agent.stream("add 3 + 4"));
    const types = events.map((e) => e.type);
    expect(types).toContain("turn_start");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("final");
  });

  it("emits MAX_TURNS error and throws AgentError when maxTurns is hit", async () => {
    const agent = new Agent(new EndlessToolLlm(), { maxTurns: 2 });
    const events = await collectEvents(agent.stream("keep going"));
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toMatchObject({
      type: "error",
      code: "MAX_TURNS",
      error: "Exceeded maxTurns (2)",
    });

    await expect(
      new Agent(new EndlessToolLlm(), { maxTurns: 2 }).run("keep going"),
    ).rejects.toMatchObject({
      name: "AgentError",
      code: "MAX_TURNS",
    });
    await expect(
      new Agent(new EndlessToolLlm(), { maxTurns: 1 }).run("keep going"),
    ).rejects.toBeInstanceOf(AgentError);
  });

  it("stops mid-loop when AbortSignal is aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const llm: LlmClient = {
      async complete() {
        calls += 1;
        if (calls >= 2) {
          // Second LLM turn should not run once aborted after the first tool round.
          throw new Error("llm called after abort");
        }
        return {
          text: "calling tool",
          toolCalls: [
            { id: "c1", name: "echo", arguments: { message: "hi" } },
          ],
        };
      },
    };
    const agent = new Agent(llm, { maxTurns: 5, signal: controller.signal });
    const gen = agent.stream("abort me");
    const seen: string[] = [];
    for await (const event of gen) {
      seen.push(event.type);
      if (event.type === "tool_result") {
        controller.abort();
      }
      if (event.type === "error") {
        expect(event).toMatchObject({ type: "error", code: "ABORTED" });
        expect(seen).toContain("tool_result");
        return;
      }
    }
    throw new Error(`expected ABORTED error, saw: ${seen.join(",")}`);
  });

  it("rejects immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const agent = new Agent(new MockLlmClient(), { signal: controller.signal });
    await expect(agent.run("noop")).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("marks tool result as failed when toolTimeoutMs is exceeded", async () => {
    const slowTool: Tool = {
      name: "slow",
      description: "intentionally slow",
      parameters: [],
      execute: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve("done"), 200);
        }),
    };
    const llm: LlmClient = {
      async complete(input) {
        const lastTool = [...input.messages].reverse().find((m) => m.role === "tool");
        if (lastTool) {
          return { text: `tool said: ${lastTool.content}` };
        }
        return {
          text: "calling slow",
          toolCalls: [{ id: "s1", name: "slow", arguments: {} }],
        };
      },
    };
    const agent = new Agent(llm, {
      tools: [slowTool],
      toolTimeoutMs: 30,
      maxTurns: 3,
    });
    const events = await collectEvents(agent.stream("go"));
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    if (toolResult?.type === "tool_result") {
      expect(toolResult.result.ok).toBe(false);
      expect(toolResult.result.error).toMatch(/timed out/i);
    }
    expect(events.some((e) => e.type === "final")).toBe(true);
  });
});
