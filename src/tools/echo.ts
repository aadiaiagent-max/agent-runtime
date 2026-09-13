import type { Tool } from "../agent/types.js";

export const echoTool: Tool = {
  name: "echo",
  description: "Echo back a string — useful for smoke tests.",
  parameters: [
    {
      name: "text",
      description: "Text to echo",
      type: "string",
      required: true,
    },
  ],
  execute(args) {
    return { text: String(args.text ?? "") };
  },
};
