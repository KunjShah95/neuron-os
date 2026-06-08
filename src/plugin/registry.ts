import { Database } from "bun:sqlite"
import type { PluginManifest } from "./manifest"
import { resolve, dirname } from "node:path"
import { mkdirSync, existsSync } from "node:fs"

export interface PluginRow {
  name: string
  version: string
  description: string
  author: string
  license: string
  signature: string
  checksum: string
  manifest: string
  created_at: number
  installs_count: number
}

export class PluginRegistry {
  private db: Database

  constructor(dbPath?: string) {
    const path = dbPath ?? resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "plugins.db")
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(path, { create: true })
    this.db.exec("PRAGMA journal_mode=WAL")
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        license TEXT NOT NULL DEFAULT '',
        signature TEXT NOT NULL,
        checksum TEXT NOT NULL,
        manifest TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        installs_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (name, version)
      );

      CREATE TABLE IF NOT EXISTS plugin_dependencies (
        plugin_name TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        dep_name TEXT NOT NULL,
        dep_version_constraint TEXT NOT NULL,
        FOREIGN KEY (plugin_name, plugin_version) REFERENCES plugins(name, version)
      );

      CREATE TABLE IF NOT EXISTS plugin_permissions (
        plugin_name TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        permission TEXT NOT NULL,
        FOREIGN KEY (plugin_name, plugin_version) REFERENCES plugins(name, version)
      );

      CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
      CREATE INDEX IF NOT EXISTS idx_plugin_deps_name ON plugin_dependencies(plugin_name);
      CREATE INDEX IF NOT EXISTS idx_plugin_perms_name ON plugin_permissions(plugin_name);
    `)
  }

  register(manifest: PluginManifest, signature: string, checksum: string): void {
    const insertPlugin = this.db.prepare(`
      INSERT OR REPLACE INTO plugins (name, version, description, author, license, signature, checksum, manifest, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `)
    const insertDep = this.db.prepare(`
      INSERT OR REPLACE INTO plugin_dependencies (plugin_name, plugin_version, dep_name, dep_version_constraint)
      VALUES (?, ?, ?, ?)
    `)
    const insertPerm = this.db.prepare(`
      INSERT OR REPLACE INTO plugin_permissions (plugin_name, plugin_version, permission)
      VALUES (?, ?, ?)
    `)

    const txn = this.db.transaction(() => {
      insertPlugin.run(
        manifest.name,
        manifest.version,
        manifest.description ?? "",
        manifest.author ?? "",
        manifest.license ?? "",
        signature,
        checksum,
        JSON.stringify(manifest),
      )
      for (const dep of manifest.dependencies) {
        insertDep.run(manifest.name, manifest.version, dep.name, dep.version)
      }
      for (const perm of manifest.permissions) {
        insertPerm.run(manifest.name, manifest.version, perm)
      }
    })
    txn()
  }

  get(name: string, version?: string): PluginRow | undefined {
    let row: PluginRow | null
    if (version) {
      row = this.db.prepare("SELECT * FROM plugins WHERE name = ? AND version = ?").get(name, version) as PluginRow | null
    } else {
      row = this.db.prepare("SELECT * FROM plugins WHERE name = ? ORDER BY created_at DESC LIMIT 1").get(name) as PluginRow | null
    }
    return row ?? undefined
  }

  list(): PluginRow[] {
    return this.db.prepare("SELECT * FROM plugins ORDER BY name, version").all() as PluginRow[]
  }

  search(query: string): PluginRow[] {
    const like = `%${query}%`
    return this.db
      .prepare(
        "SELECT * FROM plugins WHERE name LIKE ? OR description LIKE ? OR author LIKE ? ORDER BY installs_count DESC",
      )
      .all(like, like, like) as PluginRow[]
  }

  remove(name: string): void {
    const txn = this.db.transaction(() => {
      this.db.prepare("DELETE FROM plugin_permissions WHERE plugin_name = ?").run(name)
      this.db.prepare("DELETE FROM plugin_dependencies WHERE plugin_name = ?").run(name)
      this.db.prepare("DELETE FROM plugins WHERE name = ?").run(name)
    })
    txn()
  }

  incrementInstalls(name: string, version: string): void {
    this.db
      .prepare("UPDATE plugins SET installs_count = installs_count + 1 WHERE name = ? AND version = ?")
      .run(name, version)
  }

  close(): void {
    this.db.close()
  }
}
