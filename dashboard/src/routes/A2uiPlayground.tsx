import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import {
  A2uiWidgetRenderer,
  type A2uiWidget,
  type A2uiWidgetType,
  type A2uiStatusCard,
  type A2uiTaskList,
  type A2uiProgressBar,
  type A2uiActionButton,
  type A2uiLogViewer,
  type A2uiMetricChart,
  type A2uiPanel,
  type A2uiGrid,
  type A2uiTaskItem,
} from "../components/A2uiWidgets"
import { useA2uiStream } from "../contexts/A2uiStreamContext"
import { getWsUrl, api } from "../api/client"

// ── Sample widgets for the gallery ───────────────────────────────────

const SAMPLE_WIDGETS: Record<string, A2uiWidget> = {
  deploy_status: {
    id: "deploy-status",
    type: "status_card",
    title: "Deployment Status",
    value: "production",
    badge: "success",
    detail: "Last deployed 2m ago · v2.4.1 · 3 replicas healthy",
  },
  build_tasks: {
    id: "build-tasks",
    type: "task_list",
    title: "Build Pipeline",
    tasks: [
      { id: "t1", label: "Lint source", done: true },
      { id: "t2", label: "Run unit tests", done: true },
      { id: "t3", label: "Typecheck", done: false, subtasks: [
        { id: "t3a", label: "src/", done: true },
        { id: "t3b", label: "tests/", done: false },
      ]},
      { id: "t4", label: "Build bundle", done: false },
    ],
  },
  training_progress: {
    id: "training-progress",
    type: "progress_bar",
    title: "Model Training",
    progress: 73,
    label: "Epoch 12/16 · loss: 0.023",
    variant: "success",
  },
  approve_deploy: {
    id: "approve-deploy",
    type: "action_button",
    title: "Pending Action",
    label: "Approve Deployment",
    action: "deploy:approve",
    variant: "primary",
  },
  agent_logs: {
    id: "agent-logs",
    type: "log_viewer",
    title: "Agent Output",
    lines: [
      "[INFO]  Starting build pipeline...",
      "[INFO]  Linting 43 source files...",
      "[WARN]  Unused import in src/utils.ts:17",
      "[INFO]  Running 128 test cases...",
      "[PASS]  All 128 tests passed (2.4s)",
      "[INFO]  Typechecking...",
      "[PASS]  TypeScript check complete (0 errors)",
      "[INFO]  Bundling with esbuild...",
      "[DONE]  Build complete (14.2s)",
    ],
    tail: true,
    maxLines: 8,
  },
  cpu_metric: {
    id: "cpu-metric",
    type: "metric_chart",
    metric: "CPU Usage",
    value: 42.5,
    unit: "%",
    trend: "stable",
    history: [35, 42, 38, 45, 52, 48, 42, 38, 40, 43, 42],
  },
  error_card: {
    id: "error-status",
    type: "status_card",
    title: "Error Rate",
    value: "2.3%",
    badge: "warning",
    detail: "Above threshold of 1% · 147 errors in last 5m",
  },
  backup_progress: {
    id: "backup-progress",
    type: "progress_bar",
    title: "Database Backup",
    progress: 44,
    label: "1.2 GB / 2.7 GB",
    variant: "warning",
  },
}

// ── Widget builder helpers ───────────────────────────────────────────

let widgetCounter = 0

function nextId(): string {
  widgetCounter++
  return `playground-${widgetCounter}-${Date.now().toString(36)}`
}

interface BuilderState {
  widgetType: A2uiWidgetType
  scope: string
  title: string
  // status_card
  cardValue: string
  cardBadge: "success" | "warning" | "error" | "info" | ""
  cardDetail: string
  // task_list
  taskLabels: string
  taskDone: string
  // progress_bar
  progressValue: number
  progressLabel: string
  progressVariant: "primary" | "success" | "warning" | "error"
  // action_button
  buttonLabel: string
  buttonAction: string
  buttonVariant: "primary" | "secondary" | "danger"
  buttonDisabled: boolean
  // log_viewer
  logLines: string
  logTail: boolean
  // metric_chart
  metricName: string
  metricValue: number
  metricUnit: string
  metricTrend: "up" | "down" | "stable"
}

const DEFAULT_BUILDER: BuilderState = {
  widgetType: "status_card",
  scope: "playground",
  title: "My Widget",
  cardValue: "42",
  cardBadge: "info",
  cardDetail: "This is a sample status card",
  taskLabels: "Task 1\nTask 2\nTask 3",
  taskDone: "0",
  progressValue: 65,
  progressLabel: "65% complete",
  progressVariant: "primary",
  buttonLabel: "Click Me",
  buttonAction: "playground:click",
  buttonVariant: "primary",
  buttonDisabled: false,
  logLines: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
  logTail: true,
  metricName: "Requests",
  metricValue: 1234,
  metricUnit: "rps",
  metricTrend: "up",
}

function buildWidgetFromState(s: BuilderState): A2uiWidget {
  const base = { id: nextId(), title: s.title || undefined, timestamp: Date.now() }

  switch (s.widgetType) {
    case "status_card":
      return { ...base, type: "status_card", value: s.cardValue, badge: s.cardBadge || undefined, detail: s.cardDetail || undefined }
    case "task_list": {
      const labels = s.taskLabels.split("\n").filter(Boolean)
      const doneIndices = new Set(s.taskDone.split(",").map((x) => parseInt(x.trim()) - 1).filter((n) => !isNaN(n)))
      const tasks: A2uiTaskItem[] = labels.map((label, i) => ({
        id: `t-${i}`,
        label,
        done: doneIndices.has(i),
      }))
      return { ...base, type: "task_list", tasks }
    }
    case "progress_bar":
      return { ...base, type: "progress_bar", progress: s.progressValue, label: s.progressLabel || undefined, variant: s.progressVariant }
    case "action_button":
      return { ...base, type: "action_button", label: s.buttonLabel, action: s.buttonAction, variant: s.buttonVariant, disabled: s.buttonDisabled }
    case "log_viewer": {
      const lines = s.logLines.split("\n").filter(Boolean)
      return { ...base, type: "log_viewer", lines, tail: s.logTail, maxLines: 50 }
    }
    case "metric_chart":
      return { ...base, type: "metric_chart", metric: s.metricName, value: s.metricValue, unit: s.metricUnit || undefined, trend: s.metricTrend, history: Array.from({ length: 10 }, () => Math.floor(Math.random() * 80 + 10)) }
    case "panel":
      return { ...base, type: "panel", children: [], layout: "vertical" }
    case "grid":
      return { ...base, type: "grid", columns: 2, children: [] }
  }
}

// ── Tab config ───────────────────────────────────────────────────────

type Tab = "builder" | "gallery" | "json" | "events" | "skills"

interface TabDef {
  id: Tab
  label: string
  icon: string
  shortcut: string
}

const TABS: TabDef[] = [
  { id: "builder", label: "Builder", icon: "✦", shortcut: "Ctrl+1" },
  { id: "gallery", label: "Gallery", icon: "◇", shortcut: "Ctrl+2" },
  { id: "json", label: "JSON", icon: "{}", shortcut: "Ctrl+3" },
  { id: "events", label: "Events", icon: "⏱", shortcut: "Ctrl+4" },
  { id: "skills", label: "Skills", icon: "◇", shortcut: "Ctrl+5" },
]

// ── Widget type descriptions ─────────────────────────────────────────

const WIDGET_DESCRIPTIONS: Record<A2uiWidgetType, string> = {
  status_card: "A prominent status display with badge, value, and optional detail text.",
  task_list: "An interactive checklist with support for subtasks and completion states.",
  progress_bar: "A visual progress indicator with label, percentage, and color variants.",
  action_button: "A clickable action button that sends events back to the agent.",
  log_viewer: "A scrollable log output viewer with tail mode support.",
  metric_chart: "A metric display with numeric value, trend indicator, and sparkline history.",
  panel: "A container widget that groups children vertically or horizontally.",
  grid: "A responsive grid container with configurable column count.",
}

// ── Playground component ─────────────────────────────────────────────

export default function A2uiPlayground() {
  const { scopedWidgets, isConnected, clearAll, clearScope, sendAction } = useA2uiStream()

  // Builder state
  const [builder, setBuilder] = useState<BuilderState>({ ...DEFAULT_BUILDER })
  const [activeTab, setActiveTab] = useState<Tab>("builder")
  const [jsonInput, setJsonInput] = useState("")
  const [jsonError, setJsonError] = useState("")
  const [builtWidgets, setBuiltWidgets] = useState<A2uiWidget[]>([])
  const [eventLog, setEventLog] = useState<Array<{ ts: number; scope: string; type: string }>>([])
  const [selectedSample, setSelectedSample] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [emitStatus, setEmitStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  // ── Save as Skill state ──────────────────────────────────────────
  const [savingWidget, setSavingWidget] = useState<A2uiWidget | null>(null)
  const [skillName, setSkillName] = useState("")
  const [skillDesc, setSkillDesc] = useState("")
  const [skillTags, setSkillTags] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState("")

  // ── Load from Skill state ────────────────────────────────────────
  const [loadSkillOpen, setLoadSkillOpen] = useState(false)
  const [availableSkills, setAvailableSkills] = useState<Array<{
    name: string
    description: string
    tags: string[]
    type: string
    widgetJson: Record<string, unknown>
  }>>([])
  const [loadSkillStatus, setLoadSkillStatus] = useState<"idle" | "loading" | "error">("idle")
  const [loadSkillError, setLoadSkillError] = useState("")
  const [loadSkillSearch, setLoadSkillSearch] = useState("")
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)

  // ── Browse Saved Skills state ────────────────────────────────────
  const [savedSkills, setSavedSkills] = useState<Array<{
    name: string
    description: string
    tags: string[]
    type: string
    widgetJson: Record<string, unknown>
  }>>([])
  const [savedSkillsStatus, setSavedSkillsStatus] = useState<"idle" | "loading" | "error">("idle")
  const [savedSkillsError, setSavedSkillsError] = useState("")
  const [savedSkillsSearch, setSavedSkillsSearch] = useState("")

  // ── Mutate builder by path ────────────────────────────────────────
  const updateBuilder = useCallback(<K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setBuilder((prev) => ({ ...prev, [key]: value }))
  }, [])

  // ── Emit a widget via WebSocket ────────────────────────────────────
  const emitWidget = useCallback(async (widget: A2uiWidget, scope: string) => {
    setEmitStatus("sending")
    try {
      const ws = new WebSocket(getWsUrl())
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: "a2ui:widget",
            widget,
            scope,
            replace: true,
          }))
          ws.close()
          resolve()
        }
        ws.onerror = () => reject(new Error("WebSocket connection failed"))
        setTimeout(() => reject(new Error("WebSocket timeout")), 3000)
      })
      setEmitStatus("sent")
      addEvent(scope, widget.type)
      setTimeout(() => setEmitStatus("idle"), 1500)
    } catch {
      setEmitStatus("error")
      setTimeout(() => setEmitStatus("idle"), 3000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addEvent = (scope: string, type: string) => {
    setEventLog((prev) => [{ ts: Date.now(), scope, type }, ...prev].slice(0, 50))
  }

  // ── Build & emit from builder form ────────────────────────────────
  const handleBuildAndEmit = useCallback(() => {
    const widget = buildWidgetFromState(builder)
    setBuiltWidgets((prev) => [widget, ...prev].slice(0, 20))
    emitWidget(widget, builder.scope || "playground")
  }, [builder, emitWidget])

  // ── Emit from JSON ────────────────────────────────────────────────
  const handleEmitJson = useCallback(() => {
    setJsonError("")
    try {
      const parsed = JSON.parse(jsonInput)
      if (!parsed.type || !parsed.id) {
        setJsonError('Widget must have "type" and "id" fields')
        return
      }
      const widget = parsed as A2uiWidget
      const scope = (parsed as any).scope || "json"
      setBuiltWidgets((prev) => [widget, ...prev].slice(0, 20))
      emitWidget(widget, scope)
    } catch (e: any) {
      setJsonError(e.message ?? "Invalid JSON")
    }
  }, [jsonInput, emitWidget])

  // ── Emit sample widget ─────────────────────────────────────────────
  const handleEmitSample = useCallback(async (key: string) => {
    const widget = SAMPLE_WIDGETS[key]
    if (widget) {
      setSelectedSample(key)
      setBuiltWidgets((prev) => [{ ...widget, id: nextId(), timestamp: Date.now() }, ...prev].slice(0, 20))
      await emitWidget(widget, "samples").catch(() => {})
      setTimeout(() => setSelectedSample(null), 1000)
    }
  }, [emitWidget])

  // ── Emit all samples ──────────────────────────────────────────────
  const handleEmitAllSamples = useCallback(async () => {
    const entries = Object.entries(SAMPLE_WIDGETS)
    for (const [, widget] of entries) {
      const w = { ...widget, id: nextId(), timestamp: Date.now() }
      setBuiltWidgets((prev) => [w, ...prev].slice(0, 20))
      await emitWidget(w, "samples").catch(() => {})
    }
  }, [emitWidget])

  // ── Save widget as skill ─────────────────────────────────────────
  const handleSaveSkill = useCallback(async () => {
    if (!savingWidget) return
    setSaveStatus("saving")
    setSaveError("")
    try {
      const tags = skillTags.split(",").map((t) => t.trim()).filter(Boolean)
      await api.saveWidgetAsSkill({
        name: skillName || savingWidget.title?.toLowerCase().replace(/\s+/g, "-") || `a2ui-${savingWidget.type}`,
        description: skillDesc || `A2UI ${savingWidget.type} widget`,
        tags,
        type: savingWidget.type,
        widgetJson: savingWidget as unknown as Record<string, unknown>,
      })
      setSaveStatus("saved")
      addEvent("skills", `saved:${skillName || savingWidget.type}`)
      setTimeout(() => {
        setSavingWidget(null)
        setSaveStatus("idle")
        setSkillName("")
        setSkillDesc("")
        setSkillTags("")
      }, 1500)
    } catch (err: any) {
      setSaveStatus("error")
      setSaveError(err.message || "Failed to save skill")
    }
  }, [savingWidget, skillName, skillDesc, skillTags])

  // ── Helper: populate builder form from a widget JSON ─────────────
  const populateBuilderFromWidget = useCallback((widget: Record<string, unknown>) => {
    const type = (widget.type as string) || "status_card"
    const newBuilder = { ...DEFAULT_BUILDER, widgetType: type as A2uiWidgetType }

    newBuilder.title = (widget.title as string) || ""
    newBuilder.scope = (widget.scope as string) || "playground"

    switch (type) {
      case "status_card":
        newBuilder.cardValue = String(widget.value ?? "")
        newBuilder.cardBadge = (widget.badge as any) || ""
        newBuilder.cardDetail = String(widget.detail ?? "")
        break
      case "task_list": {
        const tasks = (widget.tasks as Array<{ label: string; done: boolean }>) || []
        newBuilder.taskLabels = tasks.map((t) => t.label).join("\n")
        newBuilder.taskDone = tasks.map((t, i) => t.done ? String(i + 1) : "").filter(Boolean).join(",")
        break
      }
      case "progress_bar":
        newBuilder.progressValue = (widget.progress as number) || 0
        newBuilder.progressLabel = String(widget.label ?? "")
        newBuilder.progressVariant = (widget.variant as any) || "primary"
        break
      case "action_button":
        newBuilder.buttonLabel = String(widget.label ?? "")
        newBuilder.buttonAction = String(widget.action ?? "")
        newBuilder.buttonVariant = (widget.variant as any) || "primary"
        newBuilder.buttonDisabled = !!widget.disabled
        break
      case "log_viewer": {
        const lines = (widget.lines as string[]) || []
        newBuilder.logLines = lines.join("\n")
        newBuilder.logTail = widget.tail !== false
        break
      }
      case "metric_chart":
        newBuilder.metricName = String(widget.metric ?? "")
        newBuilder.metricValue = (widget.value as number) || 0
        newBuilder.metricUnit = String(widget.unit ?? "")
        newBuilder.metricTrend = (widget.trend as any) || "stable"
        break
    }

    setBuilder(newBuilder)
    setActiveTab("builder")
  }, [])

  // ── Open load-from-skill modal ───────────────────────────────────
  const handleOpenLoadSkill = useCallback(async () => {
    setLoadSkillOpen(true)
    setLoadSkillStatus("loading")
    setLoadSkillError("")
    setSelectedSkill(null)
    setLoadSkillSearch("")
    try {
      const skills = await api.listSkills()
      setAvailableSkills(skills)
      setLoadSkillStatus("idle")
    } catch (err: any) {
      setLoadSkillError(err.message || "Failed to load skills")
      setLoadSkillStatus("error")
    }
  }, [])

  // ── Filtered skills for the picker ───────────────────────────────
  const filteredSkills = useMemo(() => {
    if (!loadSkillSearch.trim()) return availableSkills
    const q = loadSkillSearch.toLowerCase()
    return availableSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [availableSkills, loadSkillSearch])

  // ── Fetch saved skills when Skills tab is active ────────────────
  useEffect(() => {
    if (activeTab !== "skills") return
    setSavedSkillsStatus("loading")
    api.listSkills()
      .then((skills) => {
        setSavedSkills(skills)
        setSavedSkillsStatus("idle")
      })
      .catch((err: any) => {
        setSavedSkillsError(err.message || "Failed to load skills")
        setSavedSkillsStatus("error")
      })
  }, [activeTab])

  // ── Filter saved skills by search ────────────────────────────────
  const filteredSavedSkills = useMemo(() => {
    if (!savedSkillsSearch.trim()) return savedSkills
    const q = savedSkillsSearch.toLowerCase()
    return savedSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [savedSkills, savedSkillsSearch])

  // ── Aggregated widget counts from stream ───────────────────────────
  const streamCount = useMemo(() => {
    let total = 0
    for (const [, widgets] of scopedWidgets) {
      total += widgets.size
    }
    return total
  }, [scopedWidgets])

  const scopes = useMemo(() => Array.from(scopedWidgets.keys()), [scopedWidgets])

  // ── Keyboard shortcuts ───────────────────────────────────────────
  const handleBuildAndEmitRef = useRef(handleBuildAndEmit)
  handleBuildAndEmitRef.current = handleBuildAndEmit

  const builtWidgetsRef = useRef(builtWidgets)
  builtWidgetsRef.current = builtWidgets

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isCtrl = e.ctrlKey || e.metaKey

      // Ctrl+1-5: switch tabs
      if (isCtrl && e.key >= "1" && e.key <= "5") {
        e.preventDefault()
        const tabIndex = parseInt(e.key) - 1
        setActiveTab(TABS[tabIndex].id)
        return
      }

      // Ctrl+Enter: build & emit (builder tab only)
      if (isCtrl && e.key === "Enter") {
        e.preventDefault()
        if (activeTab === "builder") {
          handleBuildAndEmitRef.current()
        }
        return
      }

      // Ctrl+Z: undo last emitted widget in preview
      if (isCtrl && e.key === "z" && !e.shiftKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        setBuiltWidgets((prev) => {
          if (prev.length === 0) return prev
          return prev.slice(1) // remove the most recent (prepended) widget
        })
        return
      }

      // Ctrl+S: open save modal for the most recent widget
      if (isCtrl && e.key === "s") {
        const tag = (e.target as HTMLElement).tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        const recent = builtWidgetsRef.current[0]
        if (!recent) return
        e.preventDefault()
        setSavingWidget(recent)
        setSkillName(recent.title?.toLowerCase().replace(/\s+/g, "-") || `a2ui-${recent.type}`)
        setSkillDesc(`A2UI ${recent.type} widget${recent.title ? ` — ${recent.title}` : ""}`)
        setSkillTags("")
        setSaveStatus("idle")
        setSaveError("")
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeTab])

  return (
    <AnimatedPage className="p-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">A2UI Playground</h1>
          <p className="text-xs text-surface-500 mt-1">
            Build, preview, and emit agent UI widgets in real-time
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Keyboard shortcut hint */}
          <div className="relative group">
            <button className="w-6 h-6 rounded-lg bg-surface-800/60 border border-surface-700/30 text-[10px] text-surface-500 hover:text-surface-300 transition-colors flex items-center justify-center">
              ⌘
            </button>
            <div className="absolute right-0 top-full mt-2 w-52 p-3 rounded-xl bg-surface-900 border border-surface-700/50 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
              <div className="text-[10px] text-surface-400 font-medium mb-2">Keyboard Shortcuts</div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-surface-500"><kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-surface-400">Ctrl</kbd>+<kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-surface-400">1</kbd>–<kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-surface-400">4</kbd></span>
                  <span className="text-surface-400">Switch tabs</span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-surface-500"><kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-surface-400">Ctrl</kbd>+<kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-surface-400">Enter</kbd></span>
                  <span className="text-surface-400">Build &amp; emit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Connection indicator */}
          <motion.div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider ${
              isConnected
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-surface-800/60 text-surface-500"
            }`}
          >
            <motion.span
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-surface-500"}`}
              animate={isConnected ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {isConnected ? "Live" : "Offline"}
          </motion.div>

          {/* Clear all with confirm */}
          {!clearConfirm ? (
            <button
              onClick={() => setClearConfirm(true)}
              className="text-[10px] text-surface-600 hover:text-rose-400 transition-colors uppercase tracking-wider"
            >
              Clear All
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-rose-400 uppercase tracking-wider">Confirm?</span>
              <button
                onClick={() => { clearAll(); setClearConfirm(false) }}
                className="text-[10px] text-rose-400 hover:text-white transition-colors uppercase"
              >
                Yes
              </button>
              <button
                onClick={() => setClearConfirm(false)}
                className="text-[10px] text-surface-600 hover:text-white transition-colors uppercase"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6 bg-surface-900/40 rounded-xl p-1 border border-surface-700/30 w-fit">
        {TABS.map((tab) => (
          <div key={tab.id} className="relative group">
            <button
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${
                activeTab === tab.id
                  ? "text-white bg-amber-500/10 shadow-sm"
                  : "text-surface-500 hover:text-surface-300"
              }`}
            >
              {activeTab === tab.id && (
                <motion.span
                  layoutId="a2ui-tab-indicator"
                  className="absolute inset-0 rounded-lg bg-white/[0.04] border border-white/[0.06]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <span className="text-[13px]">{tab.icon}</span>
                {tab.label}
              </span>
            </button>
            {/* Tooltip */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-lg bg-surface-900 border border-surface-700/50 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 whitespace-nowrap">
              <span className="text-[9px] text-surface-400">
                <kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-[8px] text-surface-500 font-mono">{tab.shortcut}</kbd>
                <span className="ml-1.5 text-surface-500">{tab.label}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-6">
        {/* ── Left: Builder/JSON/Gallery ─────────────────────────────── */}
        <div className="col-span-3 space-y-6">

          {/* ── Tab: Builder ─────────────────────────────────────────── */}
          {activeTab === "builder" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                  Widget Builder
                </h2>
                <button
                  onClick={handleOpenLoadSkill}
                  className="px-2.5 py-1 rounded-lg bg-surface-800/60 border border-surface-700/30 text-[9px] text-surface-500 hover:text-amber-400 hover:border-amber-500/30 transition-all flex items-center gap-1.5"
                >
                  <span>📂</span>
                  Load from Skill
                </button>
              </div>

              {/* Widget type selector */}
              <div className="mb-5">
                <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-2">
                  Type
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(WIDGET_DESCRIPTIONS) as A2uiWidgetType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => updateBuilder("widgetType", type)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-mono transition-all border ${
                        builder.widgetType === type
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
                      }`}
                      title={WIDGET_DESCRIPTIONS[type]}
                    >
                      {type.replace("_", " ")}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-surface-600 mt-1.5 italic">
                  {WIDGET_DESCRIPTIONS[builder.widgetType]}
                </p>
              </div>

              {/* Common fields */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Scope</label>
                  <input
                    type="text"
                    value={builder.scope}
                    onChange={(e) => updateBuilder("scope", e.target.value)}
                    className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Title</label>
                  <input
                    type="text"
                    value={builder.title}
                    onChange={(e) => updateBuilder("title", e.target.value)}
                    placeholder="Optional title"
                    className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                  />
                </div>
              </div>

              {/* Type-specific fields */}
              <div className="space-y-4 mb-6">
                <AnimatePresence mode="wait">
                  {builder.widgetType === "status_card" && (
                    <motion.div key="status_card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-3 gap-4">
                      <div className="col-span-1">
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Value</label>
                        <input type="text" value={builder.cardValue} onChange={(e) => updateBuilder("cardValue", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Badge</label>
                        <select value={builder.cardBadge} onChange={(e) => updateBuilder("cardBadge", e.target.value as any)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40">
                          <option value="">None</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="error">Error</option>
                          <option value="info">Info</option>
                        </select>
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Detail</label>
                        <input type="text" value={builder.cardDetail} onChange={(e) => updateBuilder("cardDetail", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                    </motion.div>
                  )}

                  {builder.widgetType === "task_list" && (
                    <motion.div key="task_list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Tasks (one per line)</label>
                        <textarea value={builder.taskLabels} onChange={(e) => updateBuilder("taskLabels", e.target.value)} rows={4} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 font-mono focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Done task numbers (comma separated, e.g. 1,3)</label>
                        <input type="text" value={builder.taskDone} onChange={(e) => updateBuilder("taskDone", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                    </motion.div>
                  )}

                  {builder.widgetType === "progress_bar" && (
                    <motion.div key="progress_bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Progress (0-100)</label>
                        <div className="flex items-center gap-3">
                          <input type="range" min={0} max={100} value={builder.progressValue} onChange={(e) => updateBuilder("progressValue", parseInt(e.target.value))} className="flex-1 accent-amber-400" />
                          <span className="text-xs font-mono text-surface-400 w-8 text-right">{builder.progressValue}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Label</label>
                        <input type="text" value={builder.progressLabel} onChange={(e) => updateBuilder("progressLabel", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Variant</label>
                        <select value={builder.progressVariant} onChange={(e) => updateBuilder("progressVariant", e.target.value as any)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40">
                          <option value="primary">Primary</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="error">Error</option>
                        </select>
                      </div>
                    </motion.div>
                  )}

                  {builder.widgetType === "action_button" && (
                    <motion.div key="action_button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Button Label</label>
                        <input type="text" value={builder.buttonLabel} onChange={(e) => updateBuilder("buttonLabel", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Action ID</label>
                        <input type="text" value={builder.buttonAction} onChange={(e) => updateBuilder("buttonAction", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Variant</label>
                        <select value={builder.buttonVariant} onChange={(e) => updateBuilder("buttonVariant", e.target.value as any)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40">
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                          <option value="danger">Danger</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Disabled</label>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateBuilder("buttonDisabled", !builder.buttonDisabled)}
                            className={`w-9 h-5 rounded-full transition-colors ${builder.buttonDisabled ? "bg-amber-500/40" : "bg-surface-700"}`}
                          >
                            <motion.div
                              className="w-3.5 h-3.5 bg-white rounded-full shadow-sm"
                              animate={{ x: builder.buttonDisabled ? 18 : 2 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            />
                          </button>
                          <span className="text-xs text-surface-500">{builder.buttonDisabled ? "Yes" : "No"}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {builder.widgetType === "log_viewer" && (
                    <motion.div key="log_viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Log Lines (one per line)</label>
                        <textarea value={builder.logLines} onChange={(e) => updateBuilder("logLines", e.target.value)} rows={5} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 font-mono focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={builder.logTail} onChange={(e) => updateBuilder("logTail", e.target.checked)} className="accent-amber-400" />
                        <span className="text-[10px] text-surface-500 uppercase tracking-wider">Show latest only (tail mode)</span>
                      </label>
                    </motion.div>
                  )}

                  {builder.widgetType === "metric_chart" && (
                    <motion.div key="metric_chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Metric Name</label>
                        <input type="text" value={builder.metricName} onChange={(e) => updateBuilder("metricName", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Value</label>
                        <input type="number" value={builder.metricValue} onChange={(e) => updateBuilder("metricValue", parseFloat(e.target.value) || 0)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Unit</label>
                        <input type="text" value={builder.metricUnit} onChange={(e) => updateBuilder("metricUnit", e.target.value)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Trend</label>
                        <select value={builder.metricTrend} onChange={(e) => updateBuilder("metricTrend", e.target.value as any)} className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-amber-400/40">
                          <option value="up">Up ↑</option>
                          <option value="down">Down ↓</option>
                          <option value="stable">Stable →</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Build & Emit button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBuildAndEmit}
                  disabled={emitStatus === "sending"}
                  className="px-5 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-medium hover:bg-amber-500/20 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {emitStatus === "sending" ? (
                    <>
                      <motion.span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                      Sending...
                    </>
                  ) : emitStatus === "sent" ? (
                    <>
                      <span className="text-emerald-400">✓</span>
                      Sent!
                    </>
                  ) : emitStatus === "error" ? (
                    <>
                      <span className="text-rose-400">✕</span>
                      Failed
                    </>
                  ) : (
                    <>
                      <span>✦</span>
                      Build &amp; Emit
                    </>
                  )}
                </button>
                <span className="text-[9px] text-surface-600 font-mono flex items-center gap-3">
                  <span>via WebSocket → scope: "{builder.scope}"</span>
                  <span className="text-surface-700">·</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-800/80 border border-surface-700/50 text-[8px] text-surface-500 font-mono">Ctrl+Enter</kbd>
                  <span className="text-[8px] text-surface-700">emit</span>
                </span>
              </div>
            </motion.div>
          )}

          {/* ── Tab: Gallery ─────────────────────────────────────────── */}
          {activeTab === "gallery" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                  Sample Widget Gallery
                </h2>
                <button
                  onClick={handleEmitAllSamples}
                  className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[10px] font-medium hover:bg-amber-500/20 transition-all"
                >
                  Emit All
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(SAMPLE_WIDGETS).map(([key, widget]) => (
                  <motion.button
                    key={key}
                    onClick={() => handleEmitSample(key)}
                    className={`relative p-3 rounded-xl border text-left transition-all ${
                      selectedSample === key
                        ? "bg-emerald-500/10 border-emerald-500/20"
                        : "bg-surface-800/40 border-surface-700/30 hover:bg-surface-700/40 hover:border-surface-600/50"
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] text-surface-500 uppercase tracking-wider font-mono">
                        {widget.type.replace("_", " ")}
                      </span>
                      {selectedSample === key && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="text-[9px] text-emerald-400"
                        >
                          ✓ Emitted
                        </motion.span>
                      )}
                    </div>
                    <span className="text-xs text-surface-200">{widget.title || "Untitled"}</span>
                    <p className="text-[9px] text-surface-600 mt-1 leading-relaxed line-clamp-2">
                      {widget.type === "status_card" && (widget as A2uiStatusCard).detail}
                      {widget.type === "task_list" && `${(widget as A2uiTaskList).tasks.length} tasks`}
                      {widget.type === "progress_bar" && `${(widget as A2uiProgressBar).progress}% · ${(widget as A2uiProgressBar).label}`}
                      {widget.type === "action_button" && `Action: ${(widget as A2uiActionButton).action}`}
                      {widget.type === "log_viewer" && `${(widget as A2uiLogViewer).lines.length} log lines`}
                      {widget.type === "metric_chart" && `${(widget as A2uiMetricChart).metric}: ${(widget as A2uiMetricChart).value}${(widget as A2uiMetricChart).unit || ""}`}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Tab: JSON Editor ─────────────────────────────────────── */}
          {activeTab === "json" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">
                JSON Widget Editor
              </h2>
              <p className="text-[9px] text-surface-600 mb-4">
                Paste raw widget JSON. Must include <code className="text-amber-400/70">type</code> and{" "}
                <code className="text-amber-400/70">id</code> fields.
              </p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={JSON.stringify(
                  {
                    id: "custom-widget",
                    type: "metric_chart",
                    title: "Custom",
                    metric: "Throughput",
                    value: 892,
                    unit: "req/s",
                    trend: "up",
                    history: [450, 520, 610, 580, 720, 680, 810, 770, 850, 892],
                  },
                  null,
                  2,
                )}
                rows={10}
                className="w-full bg-black/60 border border-surface-700/50 rounded-xl px-4 py-3 text-xs font-mono text-surface-200 focus:outline-none focus:border-amber-400/40 transition-colors"
              />
              {jsonError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] text-rose-400 mt-2"
                >
                  ✕ {jsonError}
                </motion.p>
              )}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleEmitJson}
                  className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-medium hover:bg-amber-500/20 transition-all"
                >
                  Emit JSON Widget
                </button>
                <button
                  onClick={() => {
                    setJsonInput("")
                    setJsonError("")
                  }}
                  className="text-[10px] text-surface-600 hover:text-surface-400 transition-colors"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Tab: Events ──────────────────────────────────────────── */}
          {activeTab === "events" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                  Emit History
                </h2>
                <button
                  onClick={() => setEventLog([])}
                  className="text-[10px] text-surface-600 hover:text-surface-400 transition-colors"
                >
                  Clear
                </button>
              </div>
              {eventLog.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-2xl mb-2 opacity-20">⏱</div>
                  <p className="text-surface-600 text-xs">No widgets emitted yet. Use the Builder or Gallery tabs.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <AnimatePresence>
                    {eventLog.map((evt, i) => (
                      <motion.div
                        key={`${evt.ts}-${i}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 py-1.5 text-[11px] font-mono border-b border-surface-800/40 last:border-0"
                      >
                        <span className="text-surface-600 w-16 shrink-0">
                          {new Date(evt.ts).toLocaleTimeString()}
                        </span>
                        <span className="text-amber-400/70 w-12 shrink-0">{evt.scope}</span>
                        <span className="text-surface-400">{evt.type.replace("_", " ")}</span>
                        <span className="text-[9px] text-emerald-500/50 ml-auto">✓</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tab: Skills ──────────────────────────────────────────── */}
          {activeTab === "skills" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                    Saved Widget Skills
                  </h2>
                  <p className="text-[9px] text-surface-600 mt-0.5">
                    Browse, load, and emit skills saved from the skills/ directory
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSavedSkillsStatus("loading")
                    api.listSkills()
                      .then((skills) => {
                        setSavedSkills(skills)
                        setSavedSkillsStatus("idle")
                      })
                      .catch((err: any) => {
                        setSavedSkillsError(err.message || "Failed to load skills")
                        setSavedSkillsStatus("error")
                      })
                  }}
                  className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[10px] font-medium hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>↻</span>
                  Refresh
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <input
                  type="text"
                  value={savedSkillsSearch}
                  onChange={(e) => setSavedSkillsSearch(e.target.value)}
                  placeholder="Search by name, type, description, or tag..."
                  className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg pl-8 pr-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-surface-600">
                  🔍
                </span>
              </div>

              {/* Skill grid */}
              {savedSkillsStatus === "loading" ? (
                <div className="flex items-center justify-center py-16">
                  <motion.span
                    className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              ) : savedSkillsStatus === "error" ? (
                <div className="text-center py-12">
                  <p className="text-[10px] text-rose-400 mb-2">✕ {savedSkillsError}</p>
                  <button
                    onClick={() => {
                      setSavedSkillsStatus("loading")
                      api.listSkills()
                        .then((skills) => {
                          setSavedSkills(skills)
                          setSavedSkillsStatus("idle")
                        })
                        .catch((err: any) => {
                          setSavedSkillsError(err.message || "Failed to load skills")
                          setSavedSkillsStatus("error")
                        })
                    }}
                    className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              ) : filteredSavedSkills.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-2xl mb-3 opacity-20">◇</div>
                  <p className="text-surface-600 text-xs">
                    {savedSkills.length === 0
                      ? "No saved skills yet. Build a widget and use 'Save as Skill' to create one."
                      : "No skills match your search."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {filteredSavedSkills.map((skill) => (
                      <motion.div
                        key={skill.name}
                        layout
                        initial={{ opacity: 0, y: 12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative p-4 rounded-xl bg-surface-800/40 border border-surface-700/30 hover:bg-surface-700/40 hover:border-surface-600/50 transition-all group"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] text-amber-400/70 uppercase tracking-wider font-mono">
                            {skill.type.replace("_", " ")}
                          </span>
                          <span className="text-[9px] text-surface-600 font-mono">
                            {skill.name}
                          </span>
                        </div>

                        {/* Description */}
                        {skill.description && (
                          <p className="text-[10px] text-surface-400 leading-relaxed line-clamp-2 mb-2">
                            {skill.description}
                          </p>
                        )}

                        {/* Tags */}
                        {skill.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {skill.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded bg-surface-800/60 border border-surface-700/30 text-[7px] text-surface-500 font-mono uppercase tracking-wider"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              populateBuilderFromWidget(skill.widgetJson)
                              setActiveTab("builder")
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 hover:bg-amber-500/20 transition-all flex items-center gap-1"
                          >
                            <span>✦</span>
                            Load &amp; Build
                          </button>
                          <button
                            onClick={() => {
                              const widget = skill.widgetJson as unknown as A2uiWidget
                              if (widget.id) {
                                setBuiltWidgets((prev) => [{ ...widget, id: nextId(), timestamp: Date.now() }, ...prev].slice(0, 20))
                                emitWidget(widget, "skills")
                              }
                            }}
                            className="px-2 py-1 rounded-lg bg-surface-800/60 border border-surface-700/30 text-[9px] text-surface-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex items-center gap-1"
                          >
                            <span>▶</span>
                            Emit
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Footer stats */}
              <div className="mt-4 pt-3 border-t border-surface-700/30 flex items-center justify-between">
                <span className="text-[9px] text-surface-600">
                  {savedSkills.length} skill{savedSkills.length !== 1 ? "s" : ""} saved
                  {savedSkillsSearch.trim() && filteredSavedSkills.length !== savedSkills.length && (
                    <span className="text-surface-700 ml-1">
                      · {filteredSavedSkills.length} shown
                    </span>
                  )}
                </span>
                <button
                  onClick={() => {
                    if (savedSkills.length > 0) {
                      handleOpenLoadSkill()
                    }
                  }}
                  className={`text-[9px] transition-colors ${
                    savedSkills.length > 0
                      ? "text-surface-600 hover:text-amber-400"
                      : "text-surface-700 cursor-default"
                  }`}
                >
                  Open Picker
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Right: Live Preview ────────────────────────────────────── */}
        <div className="col-span-2 space-y-6">
          {/* Scope management */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass rounded-2xl p-5"
          >
            <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">
              Scopes
            </h2>
            {scopes.length === 0 ? (
              <p className="text-[10px] text-surface-600 italic">
                No active scopes. Emit a widget to create one.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {scopes.map((scope) => (
                  <div key={scope} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-800/40 border border-surface-700/30 text-[10px] font-mono">
                    <span className="text-surface-300">{scope}</span>
                    <span className="text-surface-600">({scopedWidgets.get(scope)?.size ?? 0})</span>
                    <button
                      onClick={() => clearScope(scope)}
                      className="text-surface-600 hover:text-rose-400 transition-colors ml-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-[9px] text-surface-600">
              <span>{streamCount} widget{streamCount !== 1 ? "s" : ""} across {scopes.length} scope{scopes.length !== 1 ? "s" : ""}</span>
              <button onClick={clearAll} className="hover:text-rose-400 transition-colors">Clear All</button>
            </div>
          </motion.div>

          {/* Preview area */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                Live Preview
              </h2>
              <div className="flex items-center gap-2">
                {builtWidgets.length > 0 && (
                  <button
                    onClick={() => setBuiltWidgets([])}
                    className="text-[9px] text-surface-600 hover:text-surface-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <span className="text-[9px] text-surface-700 font-mono">
                  {builtWidgets.length} recent
                </span>
              </div>
            </div>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {builtWidgets.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-3xl mb-3 opacity-15">▤</div>
                  <p className="text-surface-600 text-xs">Build a widget and emit it to see a preview here.</p>
                  <p className="text-surface-700 text-[10px] mt-1">
                    Widgets also appear from the A2UI Board tab.
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {builtWidgets.map((w) => (
                    <motion.div
                      key={w.id}
                      layout
                      initial={{ opacity: 0, y: 12, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.25 }}
                      className="relative group"
                    >
                      {/* Save as Skill overlay button */}
                      <button
                        onClick={() => {
                          setSavingWidget(w)
                          setSkillName(w.title?.toLowerCase().replace(/\s+/g, "-") || `a2ui-${w.type}`)
                          setSkillDesc(`A2UI ${w.type} widget${w.title ? ` — ${w.title}` : ""}`)
                          setSkillTags("")
                          setSaveStatus("idle")
                          setSaveError("")
                        }}
                        className="absolute top-2 right-2 z-10 px-2 py-1 rounded-lg bg-surface-900/80 border border-surface-700/50 text-[9px] text-surface-500 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:border-amber-500/30 transition-all flex items-center gap-1.5"
                      >
                        <span>💾</span>
                        Save as Skill
                      </button>
                      <A2uiWidgetRenderer widget={w} onAction={(action, widgetId) => {
                        sendAction(action, widgetId, builder.scope || "preview", {})
                        addEvent("preview", `action:${action}`)
                      }} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Load from Skill Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {loadSkillOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setLoadSkillOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl p-6 w-full max-w-lg border border-surface-700/30 shadow-2xl max-h-[80vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-base text-amber-400/70">📂</span>
                  <div>
                    <h2 className="text-sm font-medium text-surface-100">
                      Load from Skill
                    </h2>
                    <p className="text-[9px] text-surface-600 mt-0.5">
                      Select a saved skill to populate the builder form
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setLoadSkillOpen(false)}
                  className="w-6 h-6 rounded-lg bg-surface-800/60 border border-surface-700/30 text-[10px] text-surface-500 hover:text-surface-300 transition-colors flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-4 shrink-0">
                <input
                  type="text"
                  value={loadSkillSearch}
                  onChange={(e) => setLoadSkillSearch(e.target.value)}
                  placeholder="Search skills by name, type, or tag..."
                  className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg pl-8 pr-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-surface-600">
                  🔍
                </span>
              </div>

              {/* Skill list */}
              <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1 custom-scrollbar">
                {loadSkillStatus === "loading" ? (
                  <div className="flex items-center justify-center py-12">
                    <motion.span
                      className="w-5 h-5 border-2 border-amber-400/30 border-t-amber-400 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                ) : loadSkillStatus === "error" ? (
                  <div className="text-center py-12">
                    <p className="text-[10px] text-rose-400 mb-2">✕ {loadSkillError}</p>
                    <button
                      onClick={handleOpenLoadSkill}
                      className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredSkills.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-2xl mb-2 opacity-20">📂</div>
                    <p className="text-surface-600 text-xs">
                      {availableSkills.length === 0
                        ? "No saved skills yet. Use 'Save as Skill' on a widget to create one."
                        : "No skills match your search."}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {filteredSkills.map((skill) => (
                      <motion.button
                        key={skill.name}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => {
                          setSelectedSkill(skill.name)
                          setLoadSkillOpen(false)
                          populateBuilderFromWidget(skill.widgetJson)
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          selectedSkill === skill.name
                            ? "bg-amber-500/10 border-amber-500/20"
                            : "bg-surface-800/40 border-surface-700/30 hover:bg-surface-700/40 hover:border-surface-600/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[9px] text-amber-400/70 uppercase tracking-wider font-mono shrink-0">
                              {skill.type.replace("_", " ")}
                            </span>
                            <span className="text-surface-600">·</span>
                            <span className="text-[11px] text-surface-200 truncate">
                              {skill.name}
                            </span>
                          </div>
                          {selectedSkill === skill.name && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-[9px] text-emerald-400 shrink-0 ml-2"
                            >
                              ✓
                            </motion.span>
                          )}
                        </div>
                        {skill.description && (
                          <p className="text-[9px] text-surface-600 leading-relaxed line-clamp-1">
                            {skill.description}
                          </p>
                        )}
                        {skill.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {skill.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded bg-surface-800/60 border border-surface-700/30 text-[7px] text-surface-500 font-mono uppercase tracking-wider"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-surface-700/30 shrink-0 flex items-center justify-between">
                <span className="text-[9px] text-surface-600">
                  {availableSkills.length} skill{availableSkills.length !== 1 ? "s" : ""} saved
                </span>
                <button
                  onClick={() => setLoadSkillOpen(false)}
                  className="px-3 py-1.5 text-[10px] text-surface-500 hover:text-surface-300 transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Save as Skill Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {savingWidget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { if (saveStatus !== "saving" && saveStatus !== "saved") setSavingWidget(null) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl p-6 w-full max-w-lg border border-surface-700/30 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-medium text-surface-100">
                  Save Widget as Skill
                </h2>
                <button
                  onClick={() => { if (saveStatus !== "saving" && saveStatus !== "saved") setSavingWidget(null) }}
                  className="text-surface-600 hover:text-surface-300 transition-colors text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Widget preview mini */}
              <div className="mb-5 p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] text-surface-500 uppercase tracking-wider font-mono">
                    {savingWidget.type.replace("_", " ")}
                  </span>
                  <span className="text-surface-700">·</span>
                  <span className="text-[9px] text-surface-500">
                    {savingWidget.title || "Untitled"}
                  </span>
                </div>
                <p className="text-[10px] text-surface-600 leading-relaxed line-clamp-2">
                  {savingWidget.type === "status_card" && (savingWidget as any).detail}
                  {savingWidget.type === "task_list" && `${(savingWidget as any).tasks?.length || 0} tasks`}
                  {savingWidget.type === "progress_bar" && `${(savingWidget as any).progress}%`}
                  {savingWidget.type === "action_button" && `Action: ${(savingWidget as any).action}`}
                  {savingWidget.type === "log_viewer" && `${(savingWidget as any).lines?.length || 0} log lines`}
                  {savingWidget.type === "metric_chart" && `${(savingWidget as any).metric}: ${(savingWidget as any).value}`}
                </p>
              </div>

              {/* Form fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">
                    Skill Name <span className="text-amber-400/60">*</span>
                  </label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="e.g. deploy-status-card"
                    className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors font-mono"
                  />
                  <p className="text-[8px] text-surface-600 mt-1">Lowercase, hyphens allowed. Saved to <code className="text-amber-400/50">skills/&lt;name&gt;/SKILL.md</code></p>
                </div>

                <div>
                  <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">
                    Description <span className="text-amber-400/60">*</span>
                  </label>
                  <input
                    type="text"
                    value={skillDesc}
                    onChange={(e) => setSkillDesc(e.target.value)}
                    placeholder="A2UI status_card widget — Deployment Status"
                    className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">
                    Tags <span className="text-surface-600">(comma separated)</span>
                  </label>
                  <input
                    type="text"
                    value={skillTags}
                    onChange={(e) => setSkillTags(e.target.value)}
                    placeholder="a2ui, status_card, deployment"
                    className="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                  />
                </div>
              </div>

              {saveError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] text-rose-400 mt-3"
                >
                  ✕ {saveError}
                </motion.p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-surface-700/30">
                <button
                  onClick={() => { if (saveStatus !== "saving" && saveStatus !== "saved") setSavingWidget(null) }}
                  className="text-[10px] text-surface-500 hover:text-surface-300 transition-colors uppercase tracking-wider"
                  disabled={saveStatus === "saving" || saveStatus === "saved"}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSkill}
                  disabled={saveStatus === "saving" || saveStatus === "saved" || !skillName.trim() || !skillDesc.trim()}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                    saveStatus === "saved"
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                  } disabled:opacity-40`}
                >
                  {saveStatus === "saving" ? (
                    <>
                      <motion.span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                      Saving...
                    </>
                  ) : saveStatus === "saved" ? (
                    <>
                      <span>✓</span>
                      Saved to Skills
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      Save Skill
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  )
}
