import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Message } from "../agent/types.js";

export interface MemoryStore {
  append(messages: Message[]): Promise<void>;
  list(): Promise<Message[]>;
  clear(): Promise<void>;
}

export class InMemoryStore implements MemoryStore {
  private messages: Message[] = [];

  async append(messages: Message[]): Promise<void> {
    this.messages.push(...messages);
  }

  async list(): Promise<Message[]> {
    return [...this.messages];
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}

/** Optional JSON-file persistence for demos / local agents. */
export class JsonFileMemoryStore implements MemoryStore {
  private cache: Message[] | null = null;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<Message[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.cache = JSON.parse(raw) as Message[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async save(messages: Message[]): Promise<void> {
    this.cache = messages;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(messages, null, 2), "utf8");
  }

  async append(messages: Message[]): Promise<void> {
    const current = await this.load();
    await this.save([...current, ...messages]);
  }

  async list(): Promise<Message[]> {
    return [...(await this.load())];
  }

  async clear(): Promise<void> {
    await this.save([]);
  }
}
