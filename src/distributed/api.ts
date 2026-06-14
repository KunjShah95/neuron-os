import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { createHmac, timingSafeEqual } from "node:crypto"
import { WorkerPool } from "./pool"
import { CapacityPlacer } from "./placement"
import { SecureTransport } from "./transport"
import { createLogger } from "../cli/logger"

const log = createLogger("distributed:api")

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

export class DistributedAPI {
  private pool: WorkerPool
  private placer: CapacityPlacer
  private server: ReturnType<typeof createServer> | null = null
  private routes: Route[] = []
  private key: Buffer

  constructor(pool: WorkerPool) {
    this.pool = pool
    this.placer = new CapacityPlacer(pool)
    this.key = SecureTransport.deriveKey(process.env.AEGIS_CLUSTER_SECRET ?? "aegis-default-secret")
    this.setupRoutes()
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
        log.info(`Distributed API listening on port ${port}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()))
      this.server = null
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json")

    // Verify HMAC signature if present
    const signature = req.headers["x-aegis-signature"] as string | undefined
    if (signature && !this.verifySignature(req, signature)) {
      this.sendJson(res, 401, { error: "Invalid signature" })
      return
    }

    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    if (req.method === "OPTIONS") {
      this.sendJson(res, 200, {})
      return
    }

    let body = ""
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf-8")
    })

    req.on("end", async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      const path = url.pathname

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
    })
  }

  private verifySignature(req: IncomingMessage, signature: string): boolean {
    const body = JSON.stringify({ method: req.method, path: req.url })
    const expected = createHmac("sha256", this.key).update(body).digest("hex")
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
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
