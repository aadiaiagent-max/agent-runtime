import type { Tool } from "../agent/types.js";
import { calculatorTool } from "./calculator.js";
import { echoTool } from "./echo.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(initial: Tool[] = []) {
    for (const tool of initial) this.register(tool);
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}

export function defaultTools(): Tool[] {
  return [calculatorTool, echoTool];
}
