export type MemoryType = "working" | "episodic" | "semantic" | "procedural";

export interface MemorySlot {
  id: string;
  type: MemoryType;
  content: string;
  importance: number; // 1 to 10 scale (where 10 is permanent/critical, 1 is easily forgotten)
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
  metadata: Record<string, any>;
}

export interface MemoryStats {
  totalSlots: number;
  byType: Record<MemoryType, number>;
  averageImportance: number;
  forgottenCount: number;
}
