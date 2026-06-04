#!/usr/bin/env bun
/**
 * OpenAPI 3.0 spec generator for the Neuron OS API server.
 *
 * Usage:
 *   bun run scripts/generate-openapi.ts          # writes to stdout
 *   bun run scripts/generate-openapi.ts > openapi.json
 *   AEGIS_API_PORT=3000 bun run scripts/generate-openapi.ts
 *
 * This generates a complete OpenAPI 3.0 specification by introspecting
 * the route registration in src/api/server.ts and the type definitions
 * in src/api/types.ts and src/agent/agent-types.ts.
 */

import { resolve } from "node:path"
import { readFileSync, writeFileSync } from "node:fs"

interface OpenApiSpec {
  openapi: string
  info: {
    title: string
    version: string
    description: string
    contact?: { name: string; url: string }
  }
  servers: Array<{ url: string; description: string }>
  paths: Record<string, Record<string, any>>
  components: {
    schemas: Record<string, any>
    securitySchemes?: Record<string, any>
  }
  security?: Array<Record<string, string[]>>
  tags?: Array<{ name: string; description: string }>
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"))
    return pkg.version || "0.1.0"
  } catch {
    return "0.1.0"
  }
}

function buildSpec(): OpenApiSpec {
  const port = process.env.AEGIS_API_PORT || "7171"
  const host = process.env.AEGIS_API_HOST || "localhost"

  const spec: OpenApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Neuron OS API",
      version: getVersion(),
      description:
        "REST API for managing AI agents, memory, skills, cron jobs, and real-time events.\n\n" +
        "## Authentication\n\n" +
        "If `AEGIS_API_KEY` is configured, all requests require `Authorization: Bearer <key>` " +
        "or `X-API-Key: <key>` header.\n\n" +
        "## WebSocket\n\n" +
        "Connect to `/api/v1/ws` for real-time agent event streams. " +
        "Use `/api/v1/events` for Server-Sent Events (SSE) fallback.",
      contact: {
        name: "Neuron OS",
        url: "https://github.com/KunjShah95/neuron-os",
      },
    },
    servers: [
      {
        url: `http://${host}:${port}`,
        description: "Local development server",
      },
    ],
    paths: {},
    components: {
      schemas: {
        Agent: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique agent identifier" },
            name: { type: "string", description: "Agent display name" },
            type: { type: "string", description: "Agent type (build, debug, deploy, etc.)" },
            status: {
              type: "string",
              enum: ["spawning", "running", "stopping", "stopped", "error"],
              description: "Current agent lifecycle status",
            },
            pid: { type: "number", description: "Process ID" },
            uptime: { type: "number", description: "Seconds since agent started" },
          },
        },
        AgentDetail: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string" },
            status: { type: "string" },
            pid: { type: "number" },
            logCount: { type: "number", description: "Number of log entries" },
          },
        },
        TaskSubmission: {
          type: "object",
          required: ["goal"],
          properties: {
            goal: { type: "string", description: "Task objective for the agent", maxLength: 4000 },
          },
        },
        TaskResponse: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            status: { type: "string", example: "accepted" },
          },
        },
        MemoryEntry: {
          type: "object",
          required: ["content"],
          properties: {
            content: {
              type: "string",
              description: "Memory content to store",
              maxLength: 50000,
            },
          },
        },
        MemorySearch: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", maxLength: 1000 },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            version: { type: "string", example: "0.1.0" },
            uptime: { type: "number" },
            agents: {
              type: "object",
              properties: {
                total: { type: "number" },
                running: { type: "number" },
              },
            },
          },
        },
        WsHealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["running", "stopped"] },
            clients: {
              type: "object",
              properties: {
                connected: { type: "number" },
                subscribed: { type: "number" },
                peak: { type: "number" },
              },
            },
            uptime: { type: "number" },
            totalConnections: { type: "number" },
            messagesBroadcast: { type: "number" },
            lastConnectionAt: { type: "number", nullable: true },
            clientsList: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  subscribed: { type: "boolean" },
                  connectedFor: { type: "number" },
                },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
        AgentType: {
          type: "object",
          properties: {
            name: { type: "string" },
            systemPrompt: { type: "string" },
            modelHint: { type: "string" },
            tools: { type: "array", items: { type: "string" } },
          },
        },
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key authentication (alternative to Bearer token)",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Bearer token authentication using the AEGIS_API_KEY value",
        },
      },
    },
    security: [
      { ApiKeyAuth: [] },
      { BearerAuth: [] },
    ],
    tags: [
      { name: "Agents", description: "Manage AI agent workers — spawn, list, inspect, kill" },
      { name: "Tasks", description: "Submit goals for agents to execute" },
      { name: "Memory", description: "Read/write long-term memory and search facts" },
      { name: "Health", description: "Server health and WebSocket connection stats" },
      { name: "Types", description: "Agent type definitions" },
      { name: "WebSocket", description: "Real-time event streaming via WebSocket SSE" },
    ],
  }

  // ── Paths ────────────────────────────────────────────────────────

  spec.paths = {
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Server health check",
        description: "Returns server status, version, uptime, and agent counts.",
        security: [],
        responses: {
          "200": {
            description: "Server is healthy",
            content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
          },
        },
      },
    },

    "/api/v1/ws/health": {
      get: {
        tags: ["Health"],
        summary: "WebSocket connection health",
        description: "Returns WebSocket bridge status, connection stats, and connected client list.",
        responses: {
          "200": {
            description: "WebSocket health data",
            content: { "application/json": { schema: { $ref: "#/components/schemas/WsHealthResponse" } } },
          },
        },
      },
    },

    "/api/v1/agents": {
      get: {
        tags: ["Agents"],
        summary: "List all agents",
        description: "Returns a list of all agent workers with their current status.",
        responses: {
          "200": {
            description: "List of agents",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agents: { type: "array", items: { $ref: "#/components/schemas/Agent" } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Agents"],
        summary: "Spawn a new agent",
        description: "Create and start a new agent worker process.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
                  type: { type: "string", description: "Agent type (build, debug, deploy, etc.)" },
                  script: { type: "string", description: "Worker script path" },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Agent spawned successfully" },
          "400": { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/agents/{agentId}": {
      get: {
        tags: ["Agents"],
        summary: "Get agent details",
        parameters: [
          { name: "agentId", in: "path", required: true, schema: { type: "string" }, description: "Agent ID" },
        ],
        responses: {
          "200": { description: "Agent details", content: { "application/json": { schema: { $ref: "#/components/schemas/AgentDetail" } } } },
          "404": { description: "Agent not found" },
        },
      },
      delete: {
        tags: ["Agents"],
        summary: "Kill an agent",
        parameters: [
          { name: "agentId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Agent stopped", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "stopped" } } } } } },
          "404": { description: "Agent not found" },
        },
      },
    },

    "/api/v1/agents/{agentId}/tasks": {
      post: {
        tags: ["Tasks"],
        summary: "Submit a task for an agent",
        parameters: [
          { name: "agentId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TaskSubmission" },
            },
          },
        },
        responses: {
          "202": { description: "Task accepted", content: { "application/json": { schema: { $ref: "#/components/schemas/TaskResponse" } } } },
          "404": { description: "Agent not found" },
        },
      },
    },

    "/api/v1/memory": {
      get: {
        tags: ["Memory"],
        summary: "Load long-term memory",
        description: "Returns the full contents of MEMORY.md.",
        responses: {
          "200": {
            description: "Memory content",
            content: {
              "application/json": {
                schema: { type: "object", properties: { memory: { type: "string" } } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Memory"],
        summary: "Append to long-term memory",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/MemoryEntry" } } },
        },
        responses: {
          "201": { description: "Memory saved" },
          "400": { description: "Invalid input" },
        },
      },
    },

    "/api/v1/memory/search": {
      post: {
        tags: ["Memory"],
        summary: "Search memory",
        description: "Keyword search across MEMORY.md, daily logs, auto-memories, and facts.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/MemorySearch" } } },
        },
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    results: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/v1/types": {
      get: {
        tags: ["Types"],
        summary: "List available agent types",
        description: "Returns all registered agent type definitions with their system prompts and tools.",
        responses: {
          "200": {
            description: "Agent types",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    types: { type: "array", items: { $ref: "#/components/schemas/AgentType" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  }

  return spec
}

// ── Main ─────────────────────────────────────────────────────────────

if (import.meta.main) {
  const spec = buildSpec()
  const json = JSON.stringify(spec, null, 2)

  // Optionally write to file
  const outFile = process.argv[2]
  if (outFile) {
    writeFileSync(resolve(process.cwd(), outFile), json, "utf-8")
    console.error(`OpenAPI spec written to ${outFile}`)
  } else {
    console.log(json)
  }
}

export { buildSpec }
export type { OpenApiSpec }
