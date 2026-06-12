export interface MemoryEntry {
  content: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface StorageAdapter {
  name: string;
  
  /**
   * Initializes the storage medium (creating files, directory pathways, or setting up memory maps).
   */
  init(): Promise<void>;

  /**
   * Retrieves a value by key.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Sets a value by key.
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Deletes a value by key.
   */
  delete(key: string): Promise<void>;

  /**
   * Appends an entry to agent memory for a given namespace (e.g. 'episodic', 'semantic').
   */
  appendMemory(namespace: string, content: string, metadata?: Record<string, any>): Promise<void>;

  /**
   * Retrieves memory entries in chronological order.
   */
  getMemory(namespace: string): Promise<MemoryEntry[]>;

  /**
   * Resets all storage entries.
   */
  clear(): Promise<void>;

  /**
   * Closes connections or releases file handles cleanly.
   */
  close(): Promise<void>;
}
