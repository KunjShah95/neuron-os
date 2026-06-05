---
title: REST API Reference
description: Complete REST API reference for Aegis — all endpoints, authentication, rate limiting, validation rules, and example workflows
---

# REST API Reference

> **Base URL:** `http://localhost:8080` (configurable via `AEGIS_API_PORT` and `AEGIS_API_HOST`)  
> **Default port:** 8080  
> **Auth:** Bearer token or X-API-Key header (configured via `AEGIS_API_KEY`)  

## Overview

The API server provides programmatic access to agent management, memory operations, and system monitoring. It includes built-in rate limiting, CORS support, and input validation.

### Authentication

```http
# Bearer token
Authorization: Bearer your-api-key

# X-API-Key header
X-API-Key: your-api-key
```

If `AEGIS_API_KEY` is not set, authentication is disabled.

### Common Headers

All responses include:
```http
Content-Type: application/json
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; ...
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CORS headers (for allowed origins, default: `http://localhost:5173`):
```http
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key
```

### Rate Limiting

Default: **100 requests per minute** per IP. Configured via:
- `AEGIS_API_RATE_LIMIT` — max requests per window
- `AEGIS_API_RATE_WINDOW` — window in ms

Rate limit headers returned:
```http
Retry-After: 45
```

On exceeding limit:
```json
{
  "error": "Too many requests"
}
```
**Status:** `429 Too Many Requests`

---

## Endpoints

### Health Check

```http
GET /api/v1/health
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600.5,
  "agents": {
    "total": 3,
    "running": 2
  }
}
```

---

### List All Agents

```http
GET /api/v1/agents
```

**Response:** `200 OK`
```json
{
  "agents": [
    {
      "id": "agent-1-1717000000",
      "name": "builder-1",
      "type": "build",
      "status": "running",
      "pid": 12345,
      "uptime": 120
    },
    {
      "id": "agent-2-1717000001",
      "name": "reviewer-1",
      "type": "review",
      "status": "idle",
      "pid": 12346,
      "uptime": 60
    }
  ]
}
```

---

### Spawn a New Agent

```http
POST /api/v1/agents
Content-Type: application/json

{
  "name": "my-agent",
  "type": "build",
  "script": "src/agent/agent-worker.ts"
}
```

**Validation rules:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | ✅ | 1–64 chars, alphanumeric + `_` + `-` |
| `type` | string | ❌ | max 32 chars |
| `script` | string | ❌ | max 256 chars, defaults to `src/agent/agent-worker.ts` |

**Response:** `201 Created`
```json
{
  "id": "agent-3-1717000100",
  "name": "my-agent",
  "status": "spawning"
}
```

**Error:** `400 Bad Request`
```json
{
  "error": "\"name\" is required; \"name\" must be at least 1 characters"
}
```

---

### Get Agent Details

```http
GET /api/v1/agents/:id
```

**Response:** `200 OK`
```json
{
  "id": "agent-1-1717000000",
  "name": "builder-1",
  "type": "build",
  "status": "running",
  "pid": 12345,
  "logCount": 24
}
```

**Error:** `404 Not Found`
```json
{
  "error": "Agent not found"
}
```

---

### Kill an Agent

```http
DELETE /api/v1/agents/:id
```

**Response:** `200 OK`
```json
{
  "status": "stopped"
}
```

**Error:** `404 Not Found`
```json
{
  "error": "Agent not found"
}
```

---

### Submit a Task to an Agent

```http
POST /api/v1/agents/:id/tasks
Content-Type: application/json

{
  "goal": "Review the error handling in src/api/server.ts"
}
```

**Validation rules:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `goal` | string | ✅ | 1–4000 characters |

Sends an IPC `run-task` message to the agent. The agent must be running and listening for tasks.

**Response:** `202 Accepted`
```json
{
  "taskId": "api-1717000200000",
  "status": "accepted"
}
```

**Error:** `400 Bad Request` / `404 Not Found`

---

### Read Memory

```http
GET /api/v1/memory
```

**Response:** `200 OK`
```json
{
  "memory": "# Aegis Memory\n\nLong-term durable facts and knowledge.\n\n## 2026-05-31T15:00:00.000Z\n\nDecided to use SQLite for local storage.\n"
}
```

---

### Write to Memory

```http
POST /api/v1/memory
Content-Type: application/json

{
  "content": "Decided to implement caching with Redis"
}
```

**Validation rules:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `content` | string | ✅ | 1–50,000 characters |

**Response:** `201 Created`
```json
{
  "status": "saved"
}
```

---

### Search Memory

```http
POST /api/v1/memory/search
Content-Type: application/json

{
  "query": "caching strategy"
}
```

**Validation rules:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `query` | string | ✅ | 1–1,000 characters |

**Response:** `200 OK`
```json
{
  "results": [
    {
      "content": "Decided to implement caching with Redis",
      "timestamp": "2026-05-31T15:10:00.000Z",
      "source": "memory"
    }
  ]
}
```

---

### List Agent Types

```http
GET /api/v1/types
```

**Response:** `200 OK`
```json
{
  "types": [
    {
      "name": "build",
      "mode": "primary",
      "description": "Full-access development agent (all tools)"
    },
    {
      "name": "plan",
      "mode": "primary",
      "description": "Architecture and planning (read-only, opus model)"
    }
  ]
}
```

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted |
| 204 | No Content (CORS preflight) |
| 400 | Bad Request — validation error |
| 401 | Unauthorized — missing or invalid API key |
| 404 | Not Found — agent or endpoint doesn't exist |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |

## CORS Preflight

```http
OPTIONS /api/v1/agents
Origin: http://localhost:5173
Access-Control-Request-Method: POST
```

**Response:** `204 No Content`
```http
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key
Access-Control-Max-Age: 86400
```

## Example Workflows

### Spawn + Task

```bash
# 1. Spawn an agent
curl -X POST http://localhost:8080/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"name":"explorer","type":"read"}'

# Response: {"id":"agent-4-...","name":"explorer","status":"spawning"}

# 2. Submit a task
curl -X POST http://localhost:8080/api/v1/agents/agent-4-.../tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"goal":"Explore the project structure and summarize"}'
```

### Health Monitoring

```bash
# Check system health
curl http://localhost:8080/api/v1/health \
  -H "Authorization: Bearer $API_KEY"

# List all active agents
curl http://localhost:8080/api/v1/agents \
  -H "Authorization: Bearer $API_KEY"
```

## Server Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AEGIS_API_PORT` | `8080` | Server port |
| `AEGIS_API_HOST` | `0.0.0.0` | Server host |
| `AEGIS_API_KEY` | — | API key for authentication |
| `AEGIS_API_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `AEGIS_API_RATE_LIMIT` | `100` | Max requests per window |
| `AEGIS_API_RATE_WINDOW` | `60000` | Rate limit window in ms |
