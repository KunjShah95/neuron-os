export interface BranchState {
  name: string;
  values: Record<string, any>;
  thoughts: string[];
  lastModified: number;
}

export class SessionHistory {
  private branches = new Map<string, BranchState>();
  private activeBranchName: string = "main";

  constructor() {
    this.branches.set("main", {
      name: "main",
      values: {},
      thoughts: [],
      lastModified: Date.now(),
    });
  }

  /**
   * Spawns a new reasoning branch copying data from the active branch.
   */
  branch(name: string): void {
    if (this.branches.has(name)) {
      throw new Error(`Branch "${name}" already exists.`);
    }

    const current = this.getActiveBranch();
    this.branches.set(name, {
      name,
      values: { ...current.values },
      thoughts: [...current.thoughts],
      lastModified: Date.now(),
    });
  }

  /**
   * Changes the active branch.
   */
  checkout(name: string): void {
    if (!this.branches.has(name)) {
      throw new Error(`Branch "${name}" does not exist.`);
    }
    this.activeBranchName = name;
  }

  /**
   * Appends a thought to the active branch.
   */
  recordThought(thought: string): void {
    const branch = this.getActiveBranch();
    branch.thoughts.push(thought);
    branch.lastModified = Date.now();
  }

  /**
   * Updates state value in the active branch.
   */
  setValue(key: string, value: any): void {
    const branch = this.getActiveBranch();
    branch.values[key] = value;
    branch.lastModified = Date.now();
  }

  /**
   * Retrieves a state value from the active branch.
   */
  getValue(key: string): any {
    return this.getActiveBranch().values[key] ?? null;
  }

  /**
   * Merges a source branch's modifications into a target branch.
   * Resolves conflicts by merging arrays and prioritizing newer values.
   */
  merge(sourceBranchName: string, targetBranchName: string = "main"): void {
    const source = this.branches.get(sourceBranchName);
    const target = this.branches.get(targetBranchName);

    if (!source || !target) {
      throw new Error("Source or target branch not found.");
    }

    // Merge thoughts uniquely
    target.thoughts = Array.from(new Set([...target.thoughts, ...source.thoughts]));

    // Merge values: merge keys
    for (const [key, value] of Object.entries(source.values)) {
      const targetVal = target.values[key];

      if (targetVal === undefined) {
        target.values[key] = value;
      } else if (Array.isArray(targetVal) && Array.isArray(value)) {
        // Merge arrays uniquely
        target.values[key] = Array.from(new Set([...targetVal, ...value]));
      } else {
        // Last-Write-Wins fallback (uses source value since it represents the new branch output)
        target.values[key] = value;
      }
    }

    target.lastModified = Date.now();
  }

  /**
   * Returns active branch metadata.
   */
  getActiveBranch(): BranchState {
    return this.branches.get(this.activeBranchName)!;
  }

  /**
   * Returns metadata for all branches.
   */
  getBranches(): BranchState[] {
    return Array.from(this.branches.values());
  }
}
