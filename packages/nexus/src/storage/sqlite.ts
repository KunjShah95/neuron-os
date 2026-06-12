import type { StorageAdapter, MemoryEntry } from "./adapter.js";
import { InMemoryStorageAdapter } from "./memory.js";
import { existsSync, mkdirSync } from "fs";

export class SQLiteStorageAdapter implements StorageAdapter {
  readonly name = "sqlite-adaptive";
  private dbPath: string;
  private db: any = null;
  private fallback: StorageAdapter | null = null;
  private isBun: boolean = false;

  constructor(options: { dbPath?: string } = {}) {
    this.dbPath = options.dbPath || ":memory:";
  }

  async init(): Promise<void> {
    if (this.dbPath !== ":memory:") {
      const dir = this.dbPath.substring(0, Math.max(this.dbPath.lastIndexOf("/"), this.dbPath.lastIndexOf("\\")));
      if (dir && !existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.warn(`[Nexus SQLite] Failed to create directory for DB path: ${dir}. Falling back to memory.`);
          this.fallback = new InMemoryStorageAdapter();
          await this.fallback.init();
          return;
        }
      }
    }

    // Try loading bun:sqlite first
    try {
      if (typeof Bun !== "undefined") {
        // @ts-ignore
        const { Database } = await import("bun:sqlite");
        this.db = new Database(this.dbPath);
        this.isBun = true;
      }
    } catch (e) {
      // bun:sqlite not available or failed
    }

    // Try loading better-sqlite3 if Bun failed or isn't running
    if (!this.db) {
      try {
        // @ts-ignore
        const betterSqlite = await import("better-sqlite3");
        // better-sqlite3 exports the class as default
        const Database = betterSqlite.default;
        this.db = new Database(this.dbPath);
      } catch (e) {
        // Both failed, fallback to memory
        console.warn(
          "[Nexus SQLite] bun:sqlite and better-sqlite3 are unavailable. Falling back to an in-memory SQLite simulation."
        );
        this.fallback = new InMemoryStorageAdapter();
        await this.fallback.init();
        return;
      }
    }

    try {
      this.execute(
        "CREATE TABLE IF NOT EXISTS key_value (key TEXT PRIMARY KEY, value TEXT)"
      );
      this.execute(
        "CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT, content TEXT, metadata TEXT, timestamp TEXT)"
      );
    } catch (err) {
      console.warn(`[Nexus SQLite] Failed to initialize DB tables: ${err}. Falling back to memory.`);
      this.fallback = new InMemoryStorageAdapter();
      await this.fallback.init();
    }
  }

  private execute(sql: string, params: any[] = []): any {
    if (this.fallback) {
      throw new Error("Using fallback storage");
    }

    if (this.isBun) {
      const query = this.db.query(sql);
      return query.run(...params);
    } else {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    }
  }

  private queryAll(sql: string, params: any[] = []): any[] {
    if (this.isBun) {
      const query = this.db.query(sql);
      return query.all(...params);
    } else {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    }
  }

  private queryOne(sql: string, params: any[] = []): any {
    if (this.isBun) {
      const query = this.db.query(sql);
      return query.get(...params);
    } else {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.fallback) return this.fallback.get<T>(key);

    try {
      const row = this.queryOne("SELECT value FROM key_value WHERE key = ?", [key]);
      if (!row) return null;
      // Depending on driver, row is { value: '...' } or array
      const rawVal = typeof row === "object" ? row.value : row;
      return JSON.parse(rawVal) as T;
    } catch (e) {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.fallback) return this.fallback.set(key, value);

    const serialized = JSON.stringify(value);
    this.execute("INSERT OR REPLACE INTO key_value (key, value) VALUES (?, ?)", [
      key,
      serialized,
    ]);
  }

  async delete(key: string): Promise<void> {
    if (this.fallback) return this.fallback.delete(key);

    this.execute("DELETE FROM key_value WHERE key = ?", [key]);
  }

  async appendMemory(
    namespace: string,
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (this.fallback) return this.fallback.appendMemory(namespace, content, metadata);

    const serializedMetadata = JSON.stringify(metadata);
    const timestamp = new Date().toISOString();
    this.execute(
      "INSERT INTO memories (namespace, content, metadata, timestamp) VALUES (?, ?, ?, ?)",
      [namespace, content, serializedMetadata, timestamp]
    );
  }

  async getMemory(namespace: string): Promise<MemoryEntry[]> {
    if (this.fallback) return this.fallback.getMemory(namespace);

    try {
      const rows = this.queryAll(
        "SELECT content, metadata, timestamp FROM memories WHERE namespace = ? ORDER BY timestamp ASC",
        [namespace]
      );
      return rows.map((row: any) => ({
        content: row.content,
        metadata: JSON.parse(row.metadata || "{}"),
        timestamp: row.timestamp,
      }));
    } catch (e) {
      return [];
    }
  }

  async clear(): Promise<void> {
    if (this.fallback) return this.fallback.clear();

    this.execute("DELETE FROM key_value");
    this.execute("DELETE FROM memories");
  }

  async close(): Promise<void> {
    if (this.fallback) return this.fallback.close();

    if (this.db) {
      this.db.close();
    }
  }
}
