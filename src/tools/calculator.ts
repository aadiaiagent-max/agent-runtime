import type { Tool } from "../agent/types.js";

function evalExpression(expression: string): number {
  const cleaned = expression.replace(/\s+/g, "");
  if (!/^[-+/*().\d]+$/.test(cleaned)) {
    throw new Error(`Unsupported expression: ${expression}`);
  }
  // Limited arithmetic evaluator (no free-form JS eval).
  const tokens = cleaned.match(/(\d+(?:\.\d+)?)|[+\-*/()]/g);
  if (!tokens) throw new Error("Empty expression");

  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };

  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const r = parseFactor();
      if (op === "/" && r === 0) throw new Error("Division by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };

  const parseFactor = (): number => {
    const t = next();
    if (t === "(") {
      const v = parseExpr();
      if (next() !== ")") throw new Error("Mismatched parentheses");
      return v;
    }
    if (t === "-") return -parseFactor();
    if (t === "+") return parseFactor();
    if (t && /^\d/.test(t)) return Number(t);
    throw new Error(`Unexpected token: ${t}`);
  };

  const value = parseExpr();
  if (i !== tokens.length) throw new Error("Trailing tokens");
  return value;
}

export const calculatorTool: Tool = {
  name: "calculator",
  description: "Evaluate a basic arithmetic expression (+ - * / and parentheses).",
  parameters: [
    {
      name: "expression",
      description: "Arithmetic expression, e.g. (2 + 3) * 4",
      type: "string",
      required: true,
    },
  ],
  execute(args) {
    const expression = String(args.expression ?? "");
    return { expression, result: evalExpression(expression) };
  },
};
