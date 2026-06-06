/**
 * webhook-handler — GitHub/GitLab webhook receiver for auto-review.
 *
 * Accepts webhook events and dispatches tasks to the AgentPool:
 * - push: Analyze introduced changes
 * - pull_request: Auto-review PR diff
 *
 * Architecture:
 *   GitHub webhook → HTTP endpoint → AgentPool.submit() → agent executes → result logged
 *
 * Note: HMAC-SHA256 signature verification is done via Bun's Web Crypto API.
 * If verification is enabled with a secret, it must complete before dispatch.
 */

import { agentPool } from "../agent/agent-pool"
import { triggerEngine } from "../triggers/registry"
import { createLogger } from "../cli/logger"
import { verifyHmac } from "./hmac"

const log = createLogger("webhook")

// ── Types ─────────────────────────────────────────────────────────────

export interface WebhookConfig {
  /** Secret for verifying webhook payloads (HMAC-SHA256) */
  secret?: string
  /** Whether to auto-review pull requests */
  autoReviewPRs?: boolean
  /** Whether to auto-analyze on push events */
  autoFixOnPush?: boolean
  /** GitHub API token for posting PR comments */
  githubToken?: string
}

export interface WebhookEvent {
  source: "github" | "gitlab"
  event: string
  payload: Record<string, unknown>
  deliveryId?: string
  signature?: string
  /** Actual URL pathname of the webhook request */
  path?: string
}

// ── Event Parsing ─────────────────────────────────────────────────────

function parseGitHubEvent(event: string, payload: Record<string, unknown>): {
  action: string
  repo: string
  branch?: string
  prNumber?: number
  description: string
} {
  const repo = ((payload.repository as Record<string, unknown>)?.full_name as string) || "unknown"

  switch (event) {
    case "push": {
      const ref = (payload.ref as string) || ""
      const branch = ref.replace("refs/heads/", "")
      const commits = (payload.commits as unknown[]) || []
      return {
        action: "push",
        repo,
        branch,
        description: `Push to ${branch} with ${commits.length} commit(s)`,
      }
    }

    case "pull_request": {
      const pr = payload.pull_request as Record<string, unknown> | undefined
      const prAction = payload.action as string
      const prNumber = pr?.number as number | undefined
      const prBranch = (pr?.head as Record<string, unknown> | undefined)?.ref as string | undefined
      return {
        action: `pull_request.${prAction}`,
        repo,
        branch: prBranch,
        prNumber,
        description: `PR #${prNumber}: ${pr?.title || "untitled"} (${prAction})`,
      }
    }

    case "issues": {
      const issue = payload.issue as Record<string, unknown> | undefined
      const issueNumber = issue?.number as number | undefined
      return {
        action: `issues.${payload.action}`,
        repo,
        prNumber: issueNumber,
        description: `Issue #${issueNumber}: ${issue?.title || "untitled"} (${payload.action})`,
      }
    }

    default:
      return {
        action: event,
        repo,
        description: `${event} event on ${repo}`,
      }
  }
}

// ── Webhook Processing ────────────────────────────────────────────────

/**
 * Handle an incoming webhook event and dispatch it to the AgentPool.
 * Returns a response object suitable for the HTTP handler.
 */
export async function handleWebhookEvent(
  webhookEvent: WebhookEvent,
  config: WebhookConfig,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { source, event, payload, signature } = webhookEvent

  // Verify signature if configured
  if (config.secret && signature) {
    const rawPayload = JSON.stringify(payload)
    const valid = await verifyHmac(rawPayload, config.secret, signature)
    if (!valid) {
      log.warn("Webhook signature verification failed", { source, event })
      return { status: 401, body: { error: "Invalid signature" } }
    }
  }

  const parsed = parseGitHubEvent(event, payload)
  log.info("Webhook received", { source, event: parsed.action, repo: parsed.repo })

  // Check for registered webhook triggers that match this event
  const webhookPath = webhookEvent.path ?? `/api/v1/webhook/${source}`
  const matchedTrigger = triggerEngine.matchWebhook(webhookPath)
  if (matchedTrigger) {
    log.info(`Webhook event "${event}" matched trigger "${matchedTrigger.name}"`)
    // Fire the trigger asynchronously — don't block the webhook response
    triggerEngine.fire(matchedTrigger).catch((err) => {
      log.error(`Webhook trigger "${matchedTrigger.name}" fire failed`, { error: String(err) })
    })
  }

  // ── Route to appropriate handler ──────────────────────────────────

  switch (parsed.action) {
    case "pull_request.opened":
    case "pull_request.synchronize": {
      if (!config.autoReviewPRs) {
        return { status: 200, body: { status: "skipped", reason: "auto-review disabled" } }
      }

      const goal = [
        `Review pull request #${parsed.prNumber} in ${parsed.repo}.`,
        ``,
        `Focus on:`,
        `1. Code quality issues`,
        `2. Security vulnerabilities`,
        `3. Performance problems`,
        `4. Missed edge cases`,
        `5. Architectural concerns`,
        ``,
        `Branch: ${parsed.branch}`,
      ].join("\n")

      const taskId = agentPool.submit(goal, {
        name: `pr-review-${parsed.prNumber}`,
        priority: "high",
        tags: ["webhook", "pr-review", parsed.repo],
      })

      log.info("PR review dispatched to pool", { taskId, pr: parsed.prNumber, repo: parsed.repo })
      return { status: 202, body: { status: "accepted", taskId, action: "pr-review" } }
    }

    case "push": {
      if (!config.autoFixOnPush) {
        return { status: 200, body: { status: "skipped", reason: "auto-fix disabled" } }
      }

      const goal = [
        `Analyze the recent push to ${parsed.repo} on branch ${parsed.branch}.`,
        ``,
        `1. Check for introduced issues`,
        `2. Run linting and type-checking`,
        `3. Suggest fixes for problems found`,
        `4. Report a summary of findings`,
      ].join("\n")

      const taskId = agentPool.submit(goal, {
        name: `push-analyze-${parsed.branch?.replace(/[/-]/g, "_")}`,
        priority: "normal",
        tags: ["webhook", "push-analysis", parsed.repo],
      })

      log.info("Push analysis dispatched to pool", { taskId, branch: parsed.branch, repo: parsed.repo })
      return { status: 202, body: { status: "accepted", taskId, action: "push-analysis" } }
    }

    default:
      return { status: 200, body: { status: "ignored", reason: `Unhandled event: ${parsed.action}` } }
  }
}

/**
 * Get the API route handler for webhook events.
 * Returns a fetch-compatible handler function.
 */
export function createWebhookHandler(config: WebhookConfig) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      })
    }

    const url = new URL(request.url)
    const source = url.pathname.includes("gitlab") ? "gitlab" : "github"
    const event = request.headers.get("x-github-event") || request.headers.get("x-gitlab-event") || "push"
    const deliveryId = request.headers.get("x-github-delivery") || undefined
    const signature = request.headers.get("x-hub-signature-256") || undefined

    let payload: Record<string, unknown>
    try {
      const json = await request.json()
      payload = json as Record<string, unknown>
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const webhookEvent: WebhookEvent = { source, event, payload, deliveryId, signature, path: url.pathname }
    const result = await handleWebhookEvent(webhookEvent, config)

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    })
  }
}

/**
 * Register webhook routes by adding webhook path handling to an existing
 * Bun.serve fetch function. Returns a wrapped fetch function.
 * Call this when starting the API server to enable webhook support.
 */
export function wrapFetchWithWebhooks(
  originalFetch: (request: Request) => Promise<Response> | Response,
  config: WebhookConfig,
): (request: Request) => Promise<Response> {
  const handler = createWebhookHandler(config)

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/api/v1/webhook/")) {
      return handler(request)
    }

    return originalFetch(request)
  }
}
