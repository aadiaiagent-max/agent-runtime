import { describe, expect, it } from "vitest";
import { calculatorTool } from "../src/tools/calculator.js";
import { echoTool } from "../src/tools/echo.js";

describe("tools", () => {
  it("calculator evaluates expressions", async () => {
    const out = await calculatorTool.execute({ expression: "(2 + 3) * 4" });
    expect(out).toEqual({ expression: "(2 + 3) * 4", result: 20 });
  });

  it("calculator rejects unsafe input", () => {
    expect(() =>
      calculatorTool.execute({ expression: "process.exit(1)" }),
    ).toThrow(/Unsupported/);
  });

  it("echo returns text", async () => {
    await expect(Promise.resolve(echoTool.execute({ text: "ping" }))).resolves.toEqual({
      text: "ping",
    });
  });
});
