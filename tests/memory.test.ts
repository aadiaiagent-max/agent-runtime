import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../src/memory/MemoryStore.js";

describe("InMemoryStore", () => {
  it("appends and lists messages", async () => {
    const store = new InMemoryStore();
    await store.append([{ role: "user", content: "hi" }]);
    await store.append([{ role: "assistant", content: "hello" }]);
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.content).toBe("hi");
  });

  it("clears messages", async () => {
    const store = new InMemoryStore();
    await store.append([{ role: "user", content: "x" }]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});
