import type { StorageAdapter, MemoryEntry } from "./adapter.js";

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly name = "in-memory";
  private store = new Map<string, any>();
  private memories = new Map<string, MemoryEntry[]>();

  async init(): Promise<void> {
    // Ephemeral store, nothing to initialize
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    return value !== undefined ? (value as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async appendMemory(namespace: string, content: string, metadata: Record<string, any> = {}): Promise<void> {
    if (!this.memories.has(namespace)) {
      this.memories.set(namespace, []);
    }
    const entries = this.memories.get(namespace)!;
    entries.push({
      content,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  async getMemory(namespace: string): Promise<MemoryEntry[]> {
    return this.memories.get(namespace) || [];
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.memories.clear();
  }

  async close(): Promise<void> {
    // Nothing to release
  }
}
