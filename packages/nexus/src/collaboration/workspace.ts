export interface Participant {
  id: string;
  name: string;
  type: "human" | "agent";
  status: "idle" | "typing" | "thinking";
}

export interface WorkspaceOperation {
  key: string;
  value: any;
  timestamp: number;
  authorId: string;
  type: "set" | "append";
}

export class CollaborationWorkspace {
  readonly id: string;
  private participants = new Map<string, Participant>();
  private state = new Map<string, { value: any; lastUpdated: number; authorId: string }>();
  private changeListeners = new Set<(key: string, value: any, authorId: string) => void>();

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Registers a participant (human or agent) to the workspace.
   */
  join(participant: Participant): void {
    this.participants.set(participant.id, participant);
  }

  /**
   * Removes a participant from the workspace.
   */
  leave(participantId: string): void {
    this.participants.delete(participantId);
  }

  /**
   * Returns a list of active participants.
   */
  getParticipants(): Participant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Updates participant status.
   */
  setStatus(participantId: string, status: Participant["status"]): void {
    const p = this.participants.get(participantId);
    if (p) {
      p.status = status;
    }
  }

  /**
   * Applies a state update using a conflict resolution strategy.
   * Resolves concurrent edits using Last-Write-Wins (LWW) or custom merge operations.
   */
  applyOperation(op: WorkspaceOperation): void {
    const current = this.state.get(op.key);

    if (op.type === "set") {
      // Last-Write-Wins (LWW) Strategy
      if (!current || op.timestamp > current.lastUpdated) {
        this.state.set(op.key, {
          value: op.value,
          lastUpdated: op.timestamp,
          authorId: op.authorId,
        });
        this.notify(op.key, op.value, op.authorId);
      }
    } else if (op.type === "append") {
      // List Append Strategy
      const currentList = current ? (Array.isArray(current.value) ? current.value : [current.value]) : [];
      const newList = [...currentList, op.value];

      this.state.set(op.key, {
        value: newList,
        lastUpdated: op.timestamp,
        authorId: op.authorId,
      });
      this.notify(op.key, newList, op.authorId);
    }
  }

  /**
   * Retrieves a shared variable value.
   */
  get(key: string): any {
    return this.state.get(key)?.value ?? null;
  }

  /**
   * Subscribes to workspace state mutations.
   */
  onStateChange(listener: (key: string, value: any, authorId: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notify(key: string, value: any, authorId: string): void {
    for (const listener of this.changeListeners) {
      try {
        listener(key, value, authorId);
      } catch (err) {
        // ignore
      }
    }
  }
}
