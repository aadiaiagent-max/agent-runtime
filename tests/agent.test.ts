import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent/Agent.js";
import { MockLlmClient } from "../src/llm/LlmClient.js";
import { collectEvents } from "../src/streaming/events.js";

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
});
