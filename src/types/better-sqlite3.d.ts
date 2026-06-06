/** Minimal type declarations for better-sqlite3 */

declare module "better-sqlite3" {
  export interface Database {
    prepare(sql: string): Statement
    exec(sql: string): void
    close(): void
    transaction<T>(fn: () => T): () => T
  }

  export interface Statement {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  export interface Options {
    readonly?: boolean
    fileMustExist?: boolean
    timeout?: number
    verbose?: (message: unknown) => void
    nativeBinding?: string
  }

  function Database(filename: string | Buffer, options?: Options): Database

  export default Database
}
