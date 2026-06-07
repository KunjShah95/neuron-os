/**
 * a2ui-tool — Tool that agents use to emit A2UI widgets.
 *
 * Agents call this tool to render interactive UI components in the
 * TUI dashboard and web dashboard.
 */

import { toolRegistry, type ToolContext, type ToolResult } from "./registry"
import { a2uiManager } from "./a2ui"

const VALID_WIDGET_TYPES = [
  "status_card",
  "task_list",
  "progress_bar",
  "action_button",
  "log_viewer",
  "metric_chart",
  "panel",
  "grid",
]

toolRegistry.register({
  name: "a2ui_emit",
  description:
    "Emit an interactive UI widget for display. Use this to show status cards, task lists, progress bars, log viewers, metrics, or action buttons in the dashboard.",
  parameters: [
    {
      name: "type",
      type: "string",
      description: `Widget type: ${VALID_WIDGET_TYPES.join(", ")}`,
      required: true,
    },
    {
      name: "id",
      type: "string",
      description: "Unique widget ID (same ID replaces previous widget)",
      required: true,
    },
    {
      name: "title",
      type: "string",
      description: "Optional widget title",
      required: false,
    },
    {
      name: "value",
      type: "string",
      description: "Primary value (for status_card, progress_bar)",
      required: false,
    },
    {
      name: "badge",
      type: "string",
      description: 'Badge type: "success", "warning", "error", "info"',
      required: false,
    },
    {
      name: "detail",
      type: "string",
      description: "Additional detail text",
      required: false,
    },
    {
      name: "progress",
      type: "number",
      description: "Progress 0-100 (for progress_bar)",
      required: false,
    },
    {
      name: "label",
      type: "string",
      description: "Button or progress label",
      required: false,
    },
    {
      name: "action",
      type: "string",
      description: "Action ID for button clicks (for action_button)",
      required: false,
    },
    {
      name: "variant",
      type: "string",
      description: 'Visual variant: "primary", "secondary", "danger", "success", "warning", "error"',
      required: false,
    },
    {
      name: "disabled",
      type: "boolean",
      description: "Whether button is disabled (for action_button)",
      required: false,
    },
    {
      name: "lines",
      type: "array",
      description: "Array of log lines (for log_viewer)",
      required: false,
    },
    {
      name: "metric",
      type: "string",
      description: "Metric name (for metric_chart)",
      required: false,
    },
    {
      name: "unit",
      type: "string",
      description: "Metric unit (for metric_chart)",
      required: false,
    },
    {
      name: "trend",
      type: "string",
      description: 'Trend direction: "up", "down", "stable" (for metric_chart)',
      required: false,
    },
    {
      name: "tasks",
      type: "array",
      description: "Array of task objects with id, label, done (for task_list)",
      required: false,
    },
  ],

  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const type = params.type as string
    const id = params.id as string
    const scope = ctx.agentId || ctx.agentType || "default"

    if (!VALID_WIDGET_TYPES.includes(type)) {
      return {
        success: false,
        output: "",
        error: `Invalid A2UI widget type: ${type}. Valid types: ${VALID_WIDGET_TYPES.join(", ")}`,
      }
    }

    const base = { id, title: params.title as string | undefined, timestamp: Date.now() }

    // Build the widget
    let widget: Record<string, unknown>
    switch (type) {
      case "status_card":
        widget = {
          ...base,
          type: "status_card",
          value: (params.value as string) || "",
          badge: (params.badge as string) || undefined,
          detail: (params.detail as string) || undefined,
        }
        break
      case "progress_bar":
        widget = {
          ...base,
          type: "progress_bar",
          progress: Math.min(100, Math.max(0, (params.progress as number) ?? 0)),
          label: (params.label as string) || undefined,
          variant: (params.variant as string) || undefined,
        }
        break
      case "action_button":
        widget = {
          ...base,
          type: "action_button",
          label: (params.label as string) || "Action",
          action: (params.action as string) || id,
          variant: (params.variant as string) || "primary",
          disabled: (params.disabled as boolean) || false,
        }
        break
      case "log_viewer":
        widget = {
          ...base,
          type: "log_viewer",
          lines: Array.isArray(params.lines) ? (params.lines as string[]) : [],
        }
        break
      case "metric_chart":
        widget = {
          ...base,
          type: "metric_chart",
          metric: (params.metric as string) || id,
          value: (params.value as number) ?? 0,
          unit: (params.unit as string) || undefined,
          trend: (params.trend as string) || "stable",
        }
        break
      case "task_list":
        widget = {
          ...base,
          type: "task_list",
          tasks: Array.isArray(params.tasks)
            ? (params.tasks as Array<{ id: string; label: string; done: boolean }>)
            : [],
        }
        break
      default:
        widget = { ...base, type: "status_card", value: `Widget type ${type}` }
    }

    // Emit via A2UI manager
    a2uiManager.emit({
      widget: widget as any,
      scope,
      replace: true,
    })

    return {
      success: true,
      output: `A2UI widget "${id}" (${type}) emitted for scope "${scope}"`,
    }
  },
})
