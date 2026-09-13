import { Agent, MockLlmClient, collectEvents } from "../src/index.js";

async function main() {
  const agent = new Agent(new MockLlmClient(), {
    systemPrompt: "You are a precise math assistant. Prefer tools for arithmetic.",
  });

  console.log("=== run() ===");
  const final = await agent.run("What is 19 + 23?");
  console.log(final.content);

  console.log("\n=== stream() ===");
  const events = await collectEvents(
    new Agent(new MockLlmClient()).stream("Please add 10 + 5"),
  );
  for (const event of events) {
    console.log(event.type, JSON.stringify(event));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
