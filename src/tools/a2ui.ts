/**
 * A2UI — Agent-to-UI Framework
 *
 * Inspired by OpenClaw's A2UI architecture. Allows agents to emit interactive
 * UI widgets as structured data through the IPC protocol.
 *
 * Widget types:
 * - status_card: A status card with title, value, and optional badge
 * - task_list: A list of tasks with completion states
 * - progress_bar: A progress bar with percentage
 * - action_button: A clickable button that triggers an agent action
 * - log_viewer: A scrollable log output viewer
 * - metric_chart: A simple metric with sparkline or trend indicator
 */

import { createLogger } from "../cli/logger"
import { agentManager } from "../agent/manager"

const log = createLogger("a2ui")

// ── Widget Types ──────────────────────────────────────────────────────

export type A2uiWidgetType =
  | "status_card"
  | "task_list"
  | "progress_bar"
  | "action_button"
  | "log_viewer"
  | "metric_chart"
  | "panel"
  | "grid"

export interface A2uiWidgetBase {
  id: string
  type: A2uiWidgetType
  title?: string
  timestamp?: number
}

export interface A2uiStatusCard extends A2uiWidgetBase {
  type: "status_card"
  value: string
  badge?: "success" | "warning" | "error" | "info"
  detail?: string
}

export interface A2uiTask {
  id: string
  label: string
  done: boolean
  subtasks?: A2uiTask[]
}

export interface A2uiTaskList extends A2uiWidgetBase {
  type: "task_list"
  tasks: A2uiTask[]
}

export interface A2uiProgressBar extends A2uiWidgetBase {
  type: "progress_bar"
  progress: number // 0-100
  label?: string
  variant?: "primary" | "success" | "warning" | "error"
}

export interface A2uiActionButton extends A2uiWidgetBase {
  type: "action_button"
  label: string
  action: string // action ID sent back to agent
  variant?: "primary" | "secondary" | "danger"
  disabled?: boolean
}

export interface A2uiLogViewer extends A2uiWidgetBase {
  type: "log_viewer"
  lines: string[]
  maxLines?: number
  tail?: boolean
}

export interface A2uiMetricChart extends A2uiWidgetBase {
  type: "metric_chart"
  metric: string
  value: number
  unit?: string
  trend?: "up" | "down" | "stable"
  history?: number[]
}

export interface A2uiPanel extends A2uiWidgetBase {
  type: "panel"
  children: A2uiWidget[]
  layout?: "vertical" | "horizontal"
}

export interface A2uiGrid extends A2uiWidgetBase {
  type: "grid"
  columns: number
  children: A2uiWidget[]
}

export type A2uiWidget =
  | A2uiStatusCard
  | A2uiTaskList
  | A2uiProgressBar
  | A2uiActionButton
  | A2uiLogViewer
  | A2uiMetricChart
  | A2uiPanel
  | A2uiGrid

// ── A2UI Event ────────────────────────────────────────────────────────

export interface A2uiEvent {
  /** Widget to render (create or update by id) */
  widget: A2uiWidget
  /** Session/agent scope */
  scope: string
  /** If true, replaces existing widget with same id; else appends */
  replace?: boolean
}

export interface A2uiActionEvent {
  /** Widget action ID that was triggered */
  action: string
  /** Widget ID that triggered the action */
  widgetId: string
  /** Scope */
  scope: string
  /** Optional payload */
  payload?: Record<string, unknown>
  timestamp: number
}

// ── Action Routing ──────────────────────────────────────────────────
//
// Maps action patterns to specific agents. When a dashboard button is
// clicked, the action is routed to the matching agent via IPC.
//
// Patterns support wildcard matching:
//   "deploy:approve" → exact match
//   "deploy:*"       → prefix match (any action starting with "deploy:")
//   "*"              → catch-all

interface ActionRoute {
  pattern: string
  agentId: string
  createdAt: number
  /** If true, the route was auto-registered from an agent's emitted widget */
  autoRegistered?: boolean
}

// ── A2UI Manager ─────────────────────────────────────────────────────

export type A2uiListener = (event: A2uiEvent) => void
export type A2uiActionHandler = (action: A2uiActionEvent) => void

export class A2uiManager {
  private widgets = new Map<string, A2uiWidget[]>()
  private listeners = new Set<A2uiListener>()
  private actionHandlers = new Set<A2uiActionHandler>()
  private actionRoutes: ActionRoute[] = []

  // ── Widget lifecycle ───────────────────────────────────────────────

  /** Register a listener for A2UI widget events */
  onEvent(cb: A2uiListener): void {
    this.listeners.add(cb)
  }

  /** Remove a listener */
  offEvent(cb: A2uiListener): void {
    this.listeners.delete(cb)
  }

  /** Emit a widget from an agent — stores it and notifies listeners */
  emit(event: A2uiEvent): void {
    const { scope, widget, replace } = event

    // Auto-register action route if widget has an action field
    // Only auto-register when the scope looks like a real agent ID
    if (widget.type === "action_button" && widget.action && scope.startsWith("agent-")) {
      this.registerActionRoute(widget.action, scope, true)
    }

    // Store widget
    let scopeWidgets = this.widgets.get(scope)
    if (!scopeWidgets) {
      scopeWidgets = []
      this.widgets.set(scope, scopeWidgets)
    }

    if (replace) {
      const idx = scopeWidgets.findIndex((w) => w.id === widget.id)
      if (idx >= 0) {
        scopeWidgets[idx] = widget
      } else {
        scopeWidgets.push(widget)
      }
    } else {
      scopeWidgets.push(widget)
    }

    // Limit per scope to 100 widgets
    if (scopeWidgets.length > 100) {
      scopeWidgets.splice(0, scopeWidgets.length - 100)
    }

    // Notify listeners
    for (const cb of this.listeners) {
      try {
        cb(event)
      } catch (err) {
        log.warn("A2UI listener error", { error: String(err) })
      }
    }
  }

  // ── Action routing ────────────────────────────────────────────────

  /**
   * Register an action route — maps an action pattern to an agent ID.
   * When a matching action is triggered, an IPC message is sent to the agent.
   *
   * Pattern supports wildcards:
   *   "exact.action"  → matches only "exact.action"
   *   "prefix:*"      → matches any action starting with "prefix:"
   *   "*"             → matches any action (catch-all, lowest priority)
   */
  registerActionRoute(pattern: string, agentId: string, autoRegistered?: boolean): void {
    // Remove existing route with same pattern+agentId to avoid duplicates
    this.actionRoutes = this.actionRoutes.filter((r) => !(r.pattern === pattern && r.agentId === agentId))

    this.actionRoutes.push({
      pattern,
      agentId,
      createdAt: Date.now(),
      autoRegistered,
    })

    log.debug("A2UI action route registered", { pattern, agentId, autoRegistered })
  }

  /** Remove all action routes for a specific agent */
  removeActionRoutes(agentId: string): void {
    const before = this.actionRoutes.length
    this.actionRoutes = this.actionRoutes.filter((r) => r.agentId !== agentId)
    const removed = before - this.actionRoutes.length
    if (removed > 0) {
      log.debug("A2UI action routes removed", { agentId, count: removed })
    }
  }

  /** Remove a specific action route by pattern and agent ID */
  removeActionRoute(pattern: string, agentId: string): boolean {
    const before = this.actionRoutes.length
    this.actionRoutes = this.actionRoutes.filter((r) => !(r.pattern === pattern && r.agentId === agentId))
    return this.actionRoutes.length < before
  }

  /** List all registered action routes */
  getActionRoutes(): ActionRoute[] {
    return [...this.actionRoutes]
  }

  /**
   * Find the best-matching agent for a given action.
   * Priority: exact match > prefix wildcard > catch-all
   */
  private findRouteForAction(action: string): ActionRoute | undefined {
    // 1. Exact match
    const exact = this.actionRoutes.find((r) => r.pattern === action)
    if (exact) return exact

    // 2. Prefix wildcard (e.g., "deploy:*" matches "deploy:approve")
    const prefixMatch = this.actionRoutes.find((r) => {
      if (!r.pattern.endsWith(":*")) return false
      const prefix = r.pattern.slice(0, -2) // remove ":*"
      return action.startsWith(prefix)
    })
    if (prefixMatch) return prefixMatch

    // 3. Catch-all
    return this.actionRoutes.find((r) => r.pattern === "*")
  }

  /**
   * Register a handler for A2UI action events (widget clicks).
   * Handlers are called BEFORE IPC routing.
   */
  onAction(cb: A2uiActionHandler): void {
    this.actionHandlers.add(cb)
  }

  /** Remove an action handler */
  offAction(cb: A2uiActionHandler): void {
    this.actionHandlers.delete(cb)
  }

  /**
   * Trigger an action (e.g., button click from dashboard).
   *
   * Pipeline:
   *   1. Notify all registered action handlers (in-process callbacks)
   *   2. Route to an agent via IPC if a matching route exists
   *   3. Emit a status_card confirmation widget to the dashboard
   *   4. Log the result
   */
  triggerAction(action: A2uiActionEvent): void {
    // Step 1: Notify in-process handlers
    for (const cb of this.actionHandlers) {
      try {
        cb(action)
      } catch (err) {
        log.warn("A2UI action handler error", { error: String(err) })
      }
    }

    // Step 2: Route to agent via IPC + Step 3: Emit feedback widget
    const route = this.findRouteForAction(action.action)
    if (route) {
      try {
        const instance = agentManager.get(route.agentId)
        if (instance) {
          agentManager.sendIpc(route.agentId, {
            type: "a2ui:action",
            id: `a2ui-action-${Date.now()}`,
            payload: {
              action: action.action,
              widgetId: action.widgetId,
              scope: action.scope,
              payload: action.payload || {},
              timestamp: action.timestamp,
            },
            timestamp: Date.now(),
          })
          log.info("A2UI action routed to agent", {
            action: action.action,
            agentId: route.agentId,
          })

          // Emit success confirmation
          this.emit({
            scope: action.scope,
            replace: true,
            widget: {
              id: `action-feedback-${action.widgetId}`,
              type: "status_card",
              title: "Action Sent",
              value: action.action,
              badge: "success",
              detail: `Dispatched to "${instance.def.name}" (${route.agentId})`,
              timestamp: Date.now(),
            },
          })
        } else {
          log.warn("A2UI action route target agent not found", {
            action: action.action,
            agentId: route.agentId,
          })

          // Emit warning — agent not found
          this.emit({
            scope: action.scope,
            replace: true,
            widget: {
              id: `action-feedback-${action.widgetId}`,
              type: "status_card",
              title: "Action Failed",
              value: action.action,
              badge: "error",
              detail: `Target agent "${route.agentId}" is no longer running`,
              timestamp: Date.now(),
            },
          })
        }
      } catch (err) {
        log.warn("A2UI action IPC dispatch failed", {
          action: action.action,
          agentId: route.agentId,
          error: String(err),
        })

        // Emit error — dispatch failure
        this.emit({
          scope: action.scope,
          replace: true,
          widget: {
            id: `action-feedback-${action.widgetId}`,
            type: "status_card",
            title: "Action Error",
            value: action.action,
            badge: "error",
            detail: `IPC dispatch failed: ${String(err).slice(0, 80)}`,
            timestamp: Date.now(),
          },
        })
      }
    } else {
      log.debug("A2UI action — no route found, not dispatched to agent", {
        action: action.action,
      })

      // Emit info — no route registered for this action
      this.emit({
        scope: action.scope,
        replace: true,
        widget: {
          id: `action-feedback-${action.widgetId}`,
          type: "status_card",
          title: "No Handler",
          value: action.action,
          badge: "info",
          detail: "No agent is registered to handle this action. Spawn an agent that emits matching action buttons.",
          timestamp: Date.now(),
        },
      })
    }
  }

  /**
   * Get all action routes for display/monitoring purposes.
   */
  getActionRouteSummary(): Array<{
    pattern: string
    agentId: string
    agentName: string
    autoRegistered: boolean
    createdAt: string
  }> {
    return this.actionRoutes.map((r) => {
      const instance = agentManager.get(r.agentId)
      return {
        pattern: r.pattern,
        agentId: r.agentId,
        agentName: instance?.def.name || "unknown",
        autoRegistered: r.autoRegistered ?? false,
        createdAt: new Date(r.createdAt).toISOString(),
      }
    })
  }

  /** Get all widgets for a specific scope */
  getScopeWidgets(scope: string): A2uiWidget[] {
    return this.widgets.get(scope) ?? []
  }

  /** Get all unique scopes */
  getScopes(): string[] {
    return Array.from(this.widgets.keys())
  }

  /** Clear all widgets for a scope */
  clearScope(scope: string): void {
    this.widgets.delete(scope)
  }

  /** Clear all widgets */
  clearAll(): void {
    this.widgets.clear()
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

export const a2uiManager = new A2uiManager()

// ── Text-based rendering for TUI ──────────────────────────────────────

/**
 * Render an A2UI widget to simple text lines for TUI display.
 * Returns an array of lines (no ANSI codes by default).
 */
export function renderA2uiWidget(widget: A2uiWidget, useColors = true): string[] {
  switch (widget.type) {
    case "status_card":
      return renderStatusCard(widget)
    case "task_list":
      return renderTaskList(widget)
    case "progress_bar":
      return renderProgressBar(widget, useColors)
    case "action_button":
      return renderActionButton(widget)
    case "log_viewer":
      return renderLogViewer(widget)
    case "metric_chart":
      return renderMetricChart(widget, useColors)
    case "panel":
      return widget.children.flatMap((c) => renderA2uiWidget(c, useColors))
    case "grid":
      return widget.children.flatMap((c) => renderA2uiWidget(c, useColors))
    default:
      return [`[Unknown widget: ${(widget as any).type}]`]
  }
}

function renderStatusCard(w: A2uiStatusCard): string[] {
  const lines: string[] = []
  if (w.title) lines.push(`  ${w.title}: ${w.value}`)
  else lines.push(`  ${w.value}`)
  if (w.badge) lines.push(`    [${w.badge.toUpperCase()}]`)
  if (w.detail) lines.push(`    ${w.detail}`)
  return lines
}

function renderTaskList(w: A2uiTaskList): string[] {
  const lines: string[] = []
  if (w.title) lines.push(`  ${w.title}:`)
  for (const task of w.tasks) {
    lines.push(`  ${task.done ? "✓" : "○"} ${task.label}`)
    if (task.subtasks) {
      for (const sub of task.subtasks) {
        lines.push(`    ${sub.done ? "✓" : "○"} ${sub.label}`)
      }
    }
  }
  return lines
}

function renderProgressBar(w: A2uiProgressBar, _useColors: boolean): string[] {
  const width = 20
  const filled = Math.round((w.progress / 100) * width)
  const empty = width - filled
  const bar = `[${"█".repeat(filled)}${"░".repeat(empty)}] ${w.progress}%`
  const lines: string[] = []
  if (w.title) lines.push(`  ${w.title}:`)
  if (w.label) lines.push(`  ${w.label}`)
  lines.push(`  ${bar}`)
  return lines
}

function renderActionButton(w: A2uiActionButton): string[] {
  const lines: string[] = []
  const disabled = w.disabled ? " [DISABLED]" : ""
  lines.push(`  [${w.label}]${disabled}  (action: ${w.action})`)
  return lines
}

function renderLogViewer(w: A2uiLogViewer): string[] {
  const lines: string[] = []
  if (w.title) lines.push(`  ${w.title}:`)
  const maxLines = w.maxLines ?? w.lines.length
  const display = w.tail ? w.lines.slice(-maxLines) : w.lines.slice(0, maxLines)
  for (const line of display) {
    lines.push(`  ${line}`)
  }
  return lines
}

function renderMetricChart(w: A2uiMetricChart, _useColors: boolean): string[] {
  const lines: string[] = []
  const trendIcon = w.trend === "up" ? "↑" : w.trend === "down" ? "↓" : "→"
  const unit = w.unit ?? ""
  lines.push(`  ${w.metric}: ${w.value}${unit} ${trendIcon}`)
  if (w.history && w.history.length > 0) {
    const sparkline = w.history
      .map((v) => {
        if (v > 80) return "▇"
        if (v > 60) return "▆"
        if (v > 40) return "▅"
        if (v > 20) return "▃"
        return "▁"
      })
      .join("")
    lines.push(`  ${sparkline}`)
  }
  return lines
}
