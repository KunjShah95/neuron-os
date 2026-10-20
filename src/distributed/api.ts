import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { createHmac, timingSafeEqual } from "node:crypto"
import { WorkerPool } from "./pool"
import { CapacityPlacer } from "./placement"
import { SecureTransport } from "./transport"
import { createLogger } from "../cli/logger"

const log = createLogger("distributed:api")

const SIGNATURE_HEADER = "x-aegis-signature"
const TIMESTAMP_HEADER = "x-aegis-timestamp"
const REPLAY_WINDOW_MS = 60_000

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: string,
  params: Record<string, string>,
) => void | Promise<void>

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

export interface DistributedSignature {
  signature: string
  timestamp: string
}

function canonicalRequest(method: string, path: string, timestamp: string, body: string): string {
  return `${method}\n${path}\n${timestamp}\n${body}`
}

function safeEqualHex(a: string, b: string): boolean {
  const normalize = (value: string): string => {
    const trimmed = value.trim()
    const withoutPrefix = trimmed.startsWith("sha256=") ? trimmed.slice(7) : trimmed
    return withoutPrefix.toLowerCase()
  }
  const left = Buffer.from(normalize(a), "utf-8")
  const right = Buffer.from(normalize(b), "utf-8")
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function parseTimestamp(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return null
  return trimmed.length <= 10 ? numeric * 1000 : numeric
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0]
  return value
}

export class DistributedAPI {
  private pool: WorkerPool
  private placer: CapacityPlacer
  private server: ReturnType<typeof createServer> | null = null
  private routes: Route[] = []
  private key: Buffer
  private boundPort = 0

  constructor(pool: WorkerPool) {
    this.pool = pool
    this.placer = new CapacityPlacer(pool)
    const clusterSecret = process.env.AEGIS_CLUSTER_SECRET
    if (!clusterSecret) throw new Error("AEGIS_CLUSTER_SECRET environment variable is required for distributed runtime encryption.")
    this.key = SecureTransport.deriveKey(clusterSecret)
    this.setupRoutes()
  }

  static signRequest(
    method: string,
    path: string,
    body: string,
    key: Buffer,
    timestamp: number = Date.now(),
  ): DistributedSignature {
    const stamp = String(timestamp)
    const signature = createHmac("sha256", key).update(canonicalRequest(method, path, stamp, body)).digest("hex")
    return { signature, timestamp: stamp }
  }

  getPort(): number {
    return this.boundPort
  }

  private setupRoutes(): void {
    this.routes = [
      { method: "GET", pattern: /^\/health$/, paramNames: [], handler: this.handleHealth },
      { method: "GET", pattern: /^\/workers$/, paramNames: [], handler: this.handleListWorkers },
      { method: "GET", pattern: /^\/workers\/(.+)$/, paramNames: ["id"], handler: this.handleGetWorker },
      { method: "POST", pattern: /^\/task$/, paramNames: [], handler: this.handlePostTask },
      { method: "GET", pattern: /^\/stats$/, paramNames: [], handler: this.handleStats },
      { method: "POST", pattern: /^\/election\/reset$/, paramNames: [], handler: this.handleElectionReset },
    ]
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res))
      this.server.listen(port, () => {
        const address = this.server?.address()
        this.boundPort = typeof address === "object" && address !== null ? address.port : port
        log.info(`Distributed API listening on port ${this.boundPort}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()))
      this.server = null
      this.boundPort = 0
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    if (req.method === "OPTIONS") {
      this.sendJson(res, 200, {})
      return
    }

    const body = await this.readBody(req)
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const path = url.pathname

    const signature = headerValue(req, SIGNATURE_HEADER)
    if (!signature) {
      this.sendJson(res, 401, { error: "Missing signature" })
      return
    }

    const timestampHeader = headerValue(req, TIMESTAMP_HEADER)
    if (!timestampHeader) {
      this.sendJson(res, 401, { error: "Missing timestamp" })
      return
    }

    const timestamp = parseTimestamp(timestampHeader)
    if (timestamp === null) {
      this.sendJson(res, 401, { error: "Invalid timestamp" })
      return
    }

    if (Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
      this.sendJson(res, 401, { error: "Expired timestamp" })
      return
    }

    if (!this.verifySignature(req.method ?? "GET", path, timestampHeader.trim(), body, signature)) {
      this.sendJson(res, 401, { error: "Invalid signature" })
      return
    }

    for (const route of this.routes) {
      if (route.method !== req.method) continue
      const match = path.match(route.pattern)
      if (match) {
        const params: Record<string, string> = {}
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i] ?? ""] = decodeURIComponent(match[i + 1] ?? "")
        }
        try {
          await route.handler(req, res, body, params)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`API handler error: ${msg}`)
          this.sendJson(res, 500, { error: msg })
        }
        return
      }
    }

    this.sendJson(res, 404, { error: "Not found" })
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
      req.on("error", (err) => reject(err))
    })
  }

  private verifySignature(
    method: string,
    path: string,
    timestamp: string,
    body: string,
    signature: string,
  ): boolean {
    const expected = createHmac("sha256", this.key)
      .update(canonicalRequest(method, path, timestamp, body))
      .digest("hex")
    return safeEqualHex(signature, expected)
  }

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.statusCode = status
    res.end(JSON.stringify(data) + "\n")
  }

  private handleHealth = async (
    _req: IncomingMessage,
    res: ServerResponse,
    _body: string,
    _params: Record<string, string>,
  ): Promise<void> => {
    const local = this.pool.getLocalInfo()
    this.sendJson(res, 200, {
      status: "ok",
      nodeId: local.id,
      role: this.pool.isLeader() ? "leader" : "worker",
      workerCount: this.pool.listWorkers().length,
    })
  }

  private handleListWorkers = async (
    _req: IncomingMessage,
    res: ServerResponse,
    _body: string,
    _params: Record<string, string>,
  ): Promise<void> => {
    const workers = this.pool.listWorkers()
    this.sendJson(res, 200, workers)
  }

  private handleGetWorker = async (
    _req: IncomingMessage,
    res: ServerResponse,
    _body: string,
    params: Record<string, string>,
  ): Promise<void> => {
    const id = params["id"]
    const worker = this.pool.listWorkers().find((w) => w.id === id)
    if (!worker) {
      this.sendJson(res, 404, { error: `Worker "${id}" not found` })
      return
    }
    this.sendJson(res, 200, worker)
  }

  private handlePostTask = async (
    _req: IncomingMessage,
    res: ServerResponse,
    body: string,
    _params: Record<string, string>,
  ): Promise<void> => {
    let parsed: { type?: string; payload?: unknown; agentType?: string }
    try {
      parsed = JSON.parse(body)
    } catch {
      this.sendJson(res, 400, { error: "Invalid JSON" })
      return
    }

    if (!parsed.type) {
      this.sendJson(res, 400, { error: "Missing task type" })
      return
    }

    const placement = this.placer.findBest({
      agentType: parsed.agentType ?? parsed.type,
      requiredCpu: 1,
      requiredMemory: 512,
    })

    if (!placement) {
      this.sendJson(res, 503, { error: "No available worker" })
      return
    }

    const taskId = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const result = await this.pool.sendTask(placement.workerId, {
        id: taskId,
        type: parsed.type,
        payload: parsed.payload,
      })
      this.sendJson(res, 200, {
        taskId,
        workerId: placement.workerId,
        result,
        placement,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.sendJson(res, 500, { error: msg, taskId })
    }
  }

  private handleStats = async (
    _req: IncomingMessage,
    res: ServerResponse,
    _body: string,
    _params: Record<string, string>,
  ): Promise<void> => {
    this.sendJson(res, 200, this.pool.getStats())
  }

  private handleElectionReset = async (
    _req: IncomingMessage,
    res: ServerResponse,
    _body: string,
    _params: Record<string, string>,
  ): Promise<void> => {
    this.sendJson(res, 200, { message: "Election reset triggered" })
  }
}
