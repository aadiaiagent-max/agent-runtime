import type { AgentEvent } from "../agent/types.js";

/** Collect an async iterable of agent events into an array. */
export async function collectEvents(
  stream: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

export function isFinalEvent(
  event: AgentEvent,
): event is Extract<AgentEvent, { type: "final" }> {
  return event.type === "final";
}
