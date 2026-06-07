import fs from "fs"
import path from "path"

const DATA_DIR = path.resolve(process.cwd(), "data", "sessions")

export interface SessionRecord {
  id: string
  createdAt: string
  messages: Array<{ role: string; content: string; timestamp: string; status: string }>
  // Optional metadata
  providerConfig?: {
    provider?: string
    model?: string
    maxTokens?: number
    temperature?: number
    baseUrl?: string
    apiKeyHint?: string
  }
  environment?: Record<string, string | undefined>
  agentTraces?: Array<{ agentId?: string; event: string; data?: any; timestamp: string }>
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export async function saveSession(record: SessionRecord): Promise<void> {
  ensureDir()
  const file = path.join(DATA_DIR, `${record.id}.json`)
  return fs.promises.writeFile(file, JSON.stringify(record, null, 2), "utf8")
}

export async function loadSession(id: string): Promise<SessionRecord | null> {
  const file = path.join(DATA_DIR, `${id}.json`)
  try {
    const raw = await fs.promises.readFile(file, "utf8")
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}

export async function listSessions(): Promise<string[]> {
  ensureDir()
  const files = await fs.promises.readdir(DATA_DIR)
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
}

export async function deleteSession(id: string): Promise<void> {
  ensureDir()
  const file = path.join(DATA_DIR, `${id}.json`)
  await fs.promises.unlink(file).catch(() => {})
}

export async function renameSession(oldId: string, newId: string): Promise<void> {
  ensureDir()
  const src = path.join(DATA_DIR, `${oldId}.json`)
  const dst = path.join(DATA_DIR, `${newId}.json`)
  await fs.promises.rename(src, dst)
}

export async function exportSession(id: string, outPath: string): Promise<void> {
  ensureDir()
  const src = path.join(DATA_DIR, `${id}.json`)
  const absOut = path.resolve(process.cwd(), outPath)
  const dir = path.dirname(absOut)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.copyFile(src, absOut)
}
