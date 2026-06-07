import { Database } from "bun:sqlite"
import { randomBytes, createHash } from "node:crypto"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import { createLogger } from "../cli/logger"

const log = createLogger("auth")

export type Permission =
  | "agent:spawn"
  | "agent:stop"
  | "agent:view"
  | "agent:modify"
  | "memory:read"
  | "memory:write"
  | "memory:delete"
  | "cost:view"
  | "cost:manage"
  | "config:read"
  | "config:write"
  | "admin:all"
  | "trigger:create"
  | "trigger:delete"
  | "trigger:fire"
  | "vault:read"
  | "vault:write"

export type RoleName = "admin" | "operator" | "developer" | "viewer"

export interface Role {
  name: RoleName
  permissions: Permission[]
  parents?: RoleName[]
}

export interface RBACUser {
  id: string
  name: string
  roles: RoleName[]
  apiKeys: APICredential[]
}

export interface APICredential {
  keyHash: string
  label: string
  roles: RoleName[]
  createdAt: string
  lastUsed: string
  enabled: boolean
}

export class RBACManager {
  private db: Database

  static readonly ROLES: Record<RoleName, Role> = {
    admin: {
      name: "admin",
      permissions: ["admin:all"],
    },
    operator: {
      name: "operator",
      permissions: [
        "agent:spawn",
        "agent:stop",
        "agent:view",
        "agent:modify",
        "memory:read",
        "memory:write",
        "memory:delete",
        "cost:view",
        "cost:manage",
        "config:read",
        "config:write",
        "trigger:create",
        "trigger:delete",
        "trigger:fire",
        "vault:read",
      ],
    },
    developer: {
      name: "developer",
      permissions: ["agent:spawn", "agent:stop", "agent:view", "memory:read", "cost:view"],
    },
    viewer: {
      name: "viewer",
      permissions: ["agent:view", "memory:read"],
    },
  }

  constructor() {
    const dbPath = join(process.cwd(), "data", "auth", "rbac.db")
    const dir = join(dbPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        name TEXT PRIMARY KEY,
        permissions_json TEXT NOT NULL,
        parents_json TEXT NOT NULL DEFAULT '[]'
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        roles_json TEXT NOT NULL DEFAULT '[]'
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        key_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        label TEXT NOT NULL,
        roles_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1
      )
    `)

    this.seedDefaults()
  }

  private seedDefaults(): void {
    const existing = this.db.prepare("SELECT COUNT(*) as c FROM roles").get() as { c: number }
    if (existing.c > 0) return

    const stmt = this.db.prepare("INSERT OR IGNORE INTO roles (name, permissions_json, parents_json) VALUES (?, ?, ?)")
    for (const role of Object.values(RBACManager.ROLES)) {
      stmt.run(role.name, JSON.stringify(role.permissions), JSON.stringify(role.parents ?? []))
    }

    const adminId = "user-admin"
    this.db
      .prepare("INSERT OR IGNORE INTO users (id, name, roles_json) VALUES (?, ?, ?)")
      .run(adminId, "admin", JSON.stringify(["admin"]))
    log.info("Default roles and admin user seeded")
  }

  createUser(name: string, initialRoles: RoleName[] = []): RBACUser {
    const id = "user-" + Date.now().toString(36) + "-" + randomBytes(4).toString("hex")
    this.db
      .prepare("INSERT INTO users (id, name, roles_json) VALUES (?, ?, ?)")
      .run(id, name, JSON.stringify(initialRoles))
    log.info("User created", { id, name })
    return { id, name, roles: initialRoles, apiKeys: [] }
  }

  getUser(id: string): RBACUser | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined
    if (!row) return undefined

    const keyRows = this.db.prepare("SELECT * FROM api_keys WHERE user_id = ?").all(id) as Record<string, unknown>[]
    return {
      id: row.id as string,
      name: row.name as string,
      roles: JSON.parse(row.roles_json as string),
      apiKeys: keyRows.map((k) => this.rowToCredential(k)),
    }
  }

  addUserRole(userId: string, role: RoleName): boolean {
    const user = this.getUser(userId)
    if (!user) return false
    if (user.roles.includes(role)) return false
    user.roles.push(role)
    this.db.prepare("UPDATE users SET roles_json = ? WHERE id = ?").run(JSON.stringify(user.roles), userId)
    return true
  }

  removeUserRole(userId: string, role: RoleName): boolean {
    const user = this.getUser(userId)
    if (!user) return false
    const idx = user.roles.indexOf(role)
    if (idx === -1) return false
    user.roles.splice(idx, 1)
    this.db.prepare("UPDATE users SET roles_json = ? WHERE id = ?").run(JSON.stringify(user.roles), userId)
    return true
  }

  generateApiKey(userId: string, label: string, roles?: RoleName[]): { apiKey: string; credential: APICredential } {
    const rawKey = "aegis_" + randomBytes(32).toString("hex")
    const keyHash = createHash("sha256").update(rawKey).digest("hex")
    const createdAt = new Date().toISOString()

    const assignedRoles = roles ?? this.getUser(userId)?.roles ?? []

    this.db
      .prepare("INSERT INTO api_keys (key_hash, user_id, label, roles_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(keyHash, userId, label, JSON.stringify(assignedRoles), createdAt)

    log.info("API key generated for user", { userId, label })
    return {
      apiKey: rawKey,
      credential: { keyHash, label, roles: assignedRoles, createdAt, lastUsed: "", enabled: true },
    }
  }

  validateApiKey(apiKey: string): { valid: boolean; user?: RBACUser; permissions?: Permission[] } {
    const keyHash = createHash("sha256").update(apiKey).digest("hex")
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1").get(keyHash) as
      | Record<string, unknown>
      | undefined
    if (!row) return { valid: false }

    this.db.prepare("UPDATE api_keys SET last_used = ? WHERE key_hash = ?").run(new Date().toISOString(), keyHash)

    const userId = row.user_id as string
    const roles = JSON.parse(row.roles_json as string) as RoleName[]
    const user = this.getUser(userId)
    const permissions = this.getEffectivePermissions(roles)

    return { valid: true, user, permissions }
  }

  revokeApiKey(keyHash: string): boolean {
    const result = this.db.prepare("UPDATE api_keys SET enabled = 0 WHERE key_hash = ?").run(keyHash)
    return result.changes > 0
  }

  listApiKeys(): APICredential[] {
    const rows = this.db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToCredential(r))
  }

  hasPermission(userId: string, permission: Permission): boolean {
    const user = this.getUser(userId)
    if (!user) return false
    const effective = this.getEffectivePermissions(user.roles)
    return effective.includes("admin:all") || effective.includes(permission)
  }

  hasAnyPermission(userId: string, permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(userId, p))
  }

  requirePermission(userId: string, permission: Permission): void {
    if (!this.hasPermission(userId, permission)) {
      throw new Error(`Permission denied: user ${userId} lacks "${permission}"`)
    }
  }

  getEffectivePermissions(roles: RoleName[]): Permission[] {
    const permSet = new Set<Permission>()
    const visited = new Set<RoleName>()

    const resolve = (roleName: RoleName) => {
      if (visited.has(roleName)) return
      visited.add(roleName)

      const role = RBACManager.ROLES[roleName]
      if (!role) return

      for (const p of role.permissions) {
        permSet.add(p)
      }

      if (role.parents) {
        for (const parent of role.parents) {
          resolve(parent)
        }
      }
    }

    for (const r of roles) resolve(r)
    return Array.from(permSet)
  }

  private routePermissions = new Map<string, Permission>()

  protectRoute(route: string, action: string, permission: Permission): void {
    this.routePermissions.set(`${action.toUpperCase()}:${route}`, permission)
  }

  getRoutePermission(method: string, route: string): Permission | undefined {
    return this.routePermissions.get(`${method.toUpperCase()}:${route}`)
  }

  getStats(): { totalUsers: number; totalKeys: number; activeKeys: number } {
    const users = this.db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }
    const allKeys = this.db.prepare("SELECT COUNT(*) as c FROM api_keys").get() as { c: number }
    const activeKeys = this.db.prepare("SELECT COUNT(*) as c FROM api_keys WHERE enabled = 1").get() as { c: number }
    return { totalUsers: users.c, totalKeys: allKeys.c, activeKeys: activeKeys.c }
  }

  private rowToCredential(row: Record<string, unknown>): APICredential {
    return {
      keyHash: row.key_hash as string,
      label: row.label as string,
      roles: JSON.parse(row.roles_json as string),
      createdAt: row.created_at as string,
      lastUsed: row.last_used as string,
      enabled: (row.enabled as number) === 1,
    }
  }
}
