import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { InMemoryStorageAdapter } from "../src/storage/memory.js";
import { SQLiteStorageAdapter } from "../src/storage/sqlite.js";

describe("Storage Adapters", () => {
  describe("InMemoryStorageAdapter", () => {
    const storage = new InMemoryStorageAdapter();

    beforeAll(async () => {
      await storage.init();
    });

    test("should set and get values", async () => {
      await storage.set("foo", "bar");
      const val = await storage.get<string>("foo");
      expect(val).toBe("bar");
    });

    test("should return null for non-existent values", async () => {
      const val = await storage.get<string>("nonexistent");
      expect(val).toBeNull();
    });

    test("should delete values", async () => {
      await storage.set("to-delete", 123);
      await storage.delete("to-delete");
      const val = await storage.get<number>("to-delete");
      expect(val).toBeNull();
    });

    test("should append and fetch memories", async () => {
      await storage.appendMemory("test-ns", "memory entry 1", { tag: "test" });
      await storage.appendMemory("test-ns", "memory entry 2", { tag: "test2" });

      const memories = await storage.getMemory("test-ns");
      expect(memories.length).toBe(2);
      expect(memories[0].content).toBe("memory entry 1");
      expect(memories[0].metadata.tag).toBe("test");
      expect(memories[1].content).toBe("memory entry 2");
      expect(memories[1].metadata.tag).toBe("test2");
    });

    test("should clear all data", async () => {
      await storage.set("keep", "me");
      await storage.clear();
      const val = await storage.get("keep");
      expect(val).toBeNull();
      const memories = await storage.getMemory("test-ns");
      expect(memories.length).toBe(0);
    });
  });

  describe("SQLiteStorageAdapter", () => {
    const storage = new SQLiteStorageAdapter({ dbPath: ":memory:" });

    beforeAll(async () => {
      await storage.init();
    });

    afterAll(async () => {
      await storage.close();
    });

    test("should set and get serialized items", async () => {
      await storage.set("test-key", { nested: "data", count: 42 });
      const val = await storage.get<{ nested: string; count: number }>("test-key");
      expect(val).not.toBeNull();
      expect(val?.nested).toBe("data");
      expect(val?.count).toBe(42);
    });

    test("should append and retrieve memory logs", async () => {
      await storage.appendMemory("logs", "Log statement A", { severity: "info" });
      await storage.appendMemory("logs", "Log statement B", { severity: "warn" });

      const logs = await storage.getMemory("logs");
      expect(logs.length).toBe(2);
      expect(logs[0].content).toBe("Log statement A");
      expect(logs[0].metadata.severity).toBe("info");
      expect(logs[1].content).toBe("Log statement B");
      expect(logs[1].metadata.severity).toBe("warn");
    });

    test("should handle delete operations", async () => {
      await storage.set("key", "val");
      await storage.delete("key");
      expect(await storage.get("key")).toBeNull();
    });
  });
});
