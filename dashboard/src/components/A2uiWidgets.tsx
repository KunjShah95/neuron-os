import { motion, AnimatePresence } from "framer-motion"

// ── Type definitions matching the A2UI protocol ──────────────────────

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

export interface A2uiTaskItem {
  id: string
  label: string
  done: boolean
  subtasks?: A2uiTaskItem[]
}

export interface A2uiTaskList extends A2uiWidgetBase {
  type: "task_list"
  tasks: A2uiTaskItem[]
}

export interface A2uiProgressBar extends A2uiWidgetBase {
  type: "progress_bar"
  progress: number
  label?: string
  variant?: "primary" | "success" | "warning" | "error"
}

export interface A2uiActionButton extends A2uiWidgetBase {
  type: "action_button"
  label: string
  action: string
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

export interface A2uiWidgetEvent {
  widget: A2uiWidget
  scope: string
  replace?: boolean
}

// ── Badge color map ──────────────────────────────────────────────────

const badgeColors: Record<string, string> = {
  success: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  warning: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  error: "bg-rose-500/10 text-rose-400 border-rose-400/20",
  info: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",
}

const variantColors: Record<string, string> = {
  primary: "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20",
  secondary: "bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08]",
  danger: "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20",
  success: "bg-emerald-400/10 border-emerald-400/20 text-emerald-400",
  warning: "bg-amber-400/10 border-amber-400/20 text-amber-400",
  error: "bg-rose-500/10 border-rose-500/20 text-rose-400",
}

const progressColors: Record<string, string> = {
  primary: "bg-amber-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-rose-500",
}

// ── Widget Components ────────────────────────────────────────────────

export function A2uiStatusCardWidget({ widget }: { widget: A2uiStatusCard }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="glass rounded-2xl p-5 card-hover"
    >
      <div className="flex items-start justify-between mb-2">
        {widget.title && (
          <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono">
            {widget.title}
          </span>
        )}
        {widget.badge && (
          <span
            className={`text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border font-mono ${
              badgeColors[widget.badge] || badgeColors.info
            }`}
          >
            {widget.badge}
          </span>
        )}
      </div>
      <div className="text-2xl font-display text-white num-display mb-1">
        {widget.value}
      </div>
      {widget.detail && (
        <div className="text-xs text-surface-500 leading-relaxed">{widget.detail}</div>
      )}
    </motion.div>
  )
}

export function A2uiTaskListWidget({ widget }: { widget: A2uiTaskList }) {
  const doneCount = widget.tasks.filter((t) => t.done).length
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        {widget.title && (
          <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono">
            {widget.title}
          </span>
        )}
        <span className="text-[10px] text-surface-600">
          {doneCount}/{widget.tasks.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {widget.tasks.map((task) => (
          <div key={task.id}>
            <div className="flex items-center gap-2.5 py-1">
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center text-[8px] flex-shrink-0 ${
                  task.done
                    ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-400"
                    : "border-surface-600 text-transparent"
                }`}
              >
                {task.done ? "✓" : ""}
              </span>
              <span
                className={`text-sm ${
                  task.done ? "text-surface-500 line-through" : "text-surface-200"
                }`}
              >
                {task.label}
              </span>
            </div>
            {task.subtasks && (
              <div className="ml-6 space-y-0.5">
                {task.subtasks.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2 py-0.5">
                    <span className="w-2.5 h-2.5 rounded-full border border-surface-600 flex items-center justify-center flex-shrink-0">
                      {sub.done && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </span>
                    <span
                      className={`text-xs ${
                        sub.done ? "text-surface-600 line-through" : "text-surface-400"
                      }`}
                    >
                      {sub.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export function A2uiProgressBarWidget({ widget }: { widget: A2uiProgressBar }) {
  const colorClass = progressColors[widget.variant || "primary"] || progressColors.primary
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-2">
        {widget.title && (
          <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono">
            {widget.title}
          </span>
        )}
        <span className="text-xs font-mono text-surface-400">{widget.progress}%</span>
      </div>
      {widget.label && (
        <div className="text-xs text-surface-500 mb-2">{widget.label}</div>
      )}
      <div className="w-full h-2 bg-surface-800/60 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widget.progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${colorClass}`}
        />
      </div>
    </motion.div>
  )
}

export function A2uiActionButtonWidget({
  widget,
  onAction,
}: {
  widget: A2uiActionButton
  onAction?: (action: string, widgetId: string) => void
}) {
  const colorClass = variantColors[widget.variant || "primary"] || variantColors.primary
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      {widget.title && (
        <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono block mb-3">
          {widget.title}
        </span>
      )}
      <button
        onClick={() => onAction?.(widget.action, widget.id)}
        disabled={widget.disabled}
        className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
          widget.disabled
            ? "opacity-30 cursor-not-allowed bg-surface-800/40 border-surface-700 text-surface-500"
            : colorClass
        }`}
      >
        {widget.label}
      </button>
    </motion.div>
  )
}

export function A2uiLogViewerWidget({ widget }: { widget: A2uiLogViewer }) {
  const maxLines = widget.maxLines ?? 50
  const display = widget.tail
    ? widget.lines.slice(-maxLines)
    : widget.lines.slice(0, maxLines)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        {widget.title && (
          <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono">
            {widget.title}
          </span>
        )}
        <span className="text-[10px] text-surface-600">{widget.lines.length} lines</span>
      </div>
      <div className="bg-black/40 rounded-xl p-3 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto">
        <AnimatePresence>
          {display.map((line, i) => (
            <motion.div
              key={`${widget.id}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.01 }}
              className="text-surface-400 hover:text-surface-200 transition-colors"
            >
              {line}
            </motion.div>
          ))}
        </AnimatePresence>
        {display.length === 0 && (
          <div className="text-surface-600 italic">No log output yet</div>
        )}
      </div>
    </motion.div>
  )
}

export function A2uiMetricChartWidget({ widget }: { widget: A2uiMetricChart }) {
  const trendIcon = widget.trend === "up" ? "↑" : widget.trend === "down" ? "↓" : "→"
  const trendColor =
    widget.trend === "up"
      ? "text-emerald-400"
      : widget.trend === "down"
        ? "text-rose-400"
        : "text-surface-400"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono">
          {widget.metric}
        </span>
        <span className={`text-sm font-mono ${trendColor}`}>{trendIcon}</span>
      </div>
      <div className="text-2xl font-display text-white num-display mb-1">
        {widget.value}
        {widget.unit && (
          <span className="text-sm text-surface-500 ml-1">{widget.unit}</span>
        )}
      </div>
      {widget.history && widget.history.length > 0 && (
        <div className="mt-3 flex items-end gap-0.5 h-8">
          {widget.history.map((v, i) => {
            const height = Math.max(4, (v / 100) * 32)
            return (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height }}
                transition={{ delay: i * 0.02, duration: 0.4 }}
                className={`w-2 rounded-t-sm ${
                  v > 80
                    ? "bg-emerald-400/60"
                    : v > 60
                      ? "bg-emerald-400/40"
                      : v > 40
                        ? "bg-amber-400/40"
                        : v > 20
                          ? "bg-amber-400/20"
                          : "bg-surface-600/40"
                }`}
              />
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

// ── Container Widgets ────────────────────────────────────────────────

export function A2uiPanelWidget({
  widget,
  onAction,
}: {
  widget: A2uiPanel
  onAction?: (action: string, widgetId: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl p-4 ${
        widget.layout === "horizontal" ? "flex gap-4" : "space-y-3"
      }`}
    >
      {widget.title && (
        <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono block mb-2">
          {widget.title}
        </span>
      )}
      {widget.children.map((child) => (
        <A2uiWidgetRenderer key={child.id} widget={child} onAction={onAction} />
      ))}
    </motion.div>
  )
}

export function A2uiGridWidget({
  widget,
  onAction,
}: {
  widget: A2uiGrid
  onAction?: (action: string, widgetId: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {widget.title && (
        <span className="text-[10px] text-surface-400 uppercase tracking-wider font-mono block mb-3">
          {widget.title}
        </span>
      )}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${widget.columns}, 1fr)` }}
      >
        {widget.children.map((child) => (
          <A2uiWidgetRenderer key={child.id} widget={child} onAction={onAction} />
        ))}
      </div>
    </motion.div>
  )
}

// ── Universal Renderer ───────────────────────────────────────────────

export function A2uiWidgetRenderer({
  widget,
  onAction,
}: {
  widget: A2uiWidget
  onAction?: (action: string, widgetId: string) => void
}) {
  switch (widget.type) {
    case "status_card":
      return <A2uiStatusCardWidget widget={widget} />
    case "task_list":
      return <A2uiTaskListWidget widget={widget} />
    case "progress_bar":
      return <A2uiProgressBarWidget widget={widget} />
    case "action_button":
      return <A2uiActionButtonWidget widget={widget} onAction={onAction} />
    case "log_viewer":
      return <A2uiLogViewerWidget widget={widget} />
    case "metric_chart":
      return <A2uiMetricChartWidget widget={widget} />
    case "panel":
      return <A2uiPanelWidget widget={widget} onAction={onAction} />
    case "grid":
      return <A2uiGridWidget widget={widget} onAction={onAction} />
    default:
      return (
        <div className="glass rounded-2xl p-5 text-surface-500 text-sm">
          Unknown widget type: {(widget as any).type}
        </div>
      )
  }
}
