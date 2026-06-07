import { useState } from "react"
// ── Types for the eval dashboard (mirrors harness types) ──────────

interface EvalDashboardData {
  lastRun?: { timestamp: string; passed: number; failed: number; avgScore: number; totalCost: number }
  baselines: Array<{ id: string; model: string; suite: string; avgScore: number; timestamp: string }>
  pendingReviews: number
  ciStatus: { passed: boolean; lastChecked: string }
}

// ── Mock data (would come from API in production) ─────────────────

const MOCK_DATA: EvalDashboardData = {
  lastRun: {
    timestamp: new Date().toISOString(),
    passed: 42,
    failed: 3,
    avgScore: 0.88,
    totalCost: 4.20,
  },
  baselines: [
    { id: "baseline-a1b2c3", model: "claude-sonnet-4-6", suite: "full-suite", avgScore: 0.91, timestamp: "2026-06-05T10:00:00Z" },
    { id: "baseline-d4e5f6", model: "claude-sonnet-4-6", suite: "full-suite", avgScore: 0.88, timestamp: "2026-06-04T10:00:00Z" },
    { id: "baseline-g7h8i9", model: "gpt-4o", suite: "regression", avgScore: 0.85, timestamp: "2026-06-03T10:00:00Z" },
  ],
  pendingReviews: 2,
  ciStatus: { passed: true, lastChecked: "2026-06-07T08:30:00Z" },
}

// ── Stat Card ─────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: "green" | "red" | "amber" | "blue" }) {
  const colorMap = { green: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20", red: "from-red-500/20 to-red-500/5 border-red-500/20", amber: "from-amber-500/20 to-amber-500/5 border-amber-500/20", blue: "from-blue-500/20 to-blue-500/5 border-blue-500/20" }
  const textMap = { green: "text-emerald-400", red: "text-red-400", amber: "text-amber-400", blue: "text-blue-400" }
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${colorMap[color]} p-4`}>
      <div className="text-[11px] uppercase tracking-[0.15em] text-ink-400 font-mono mb-1">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${textMap[color]}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-400 mt-1">{sub}</div>}
    </div>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────

function Sparkline({ data, height = 40, width = 120 }: { data: number[]; height?: number; width?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(" ")
  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40" />
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────

export default function Eval() {
  const [data] = useState<EvalDashboardData>(MOCK_DATA)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">🧪 Evaluation Dashboard</h1>
          <p className="text-[12px] text-ink-400 font-mono mt-1">Last run: {data.lastRun ? new Date(data.lastRun.timestamp).toLocaleString() : "never"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono ${data.ciStatus.passed ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${data.ciStatus.passed ? "bg-emerald-400" : "bg-red-400"}`} />
            CI: {data.ciStatus.passed ? "PASSING" : "FAILING"}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      {data.lastRun && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Pass Rate" value={`${((data.lastRun.passed / (data.lastRun.passed + data.lastRun.failed)) * 100).toFixed(0)}%`} sub={`${data.lastRun.passed}/${data.lastRun.passed + data.lastRun.failed} tests`} color="green" />
          <StatCard label="Avg Score" value={`${(data.lastRun.avgScore * 100).toFixed(0)}%`} sub="Composite score" color="blue" />
          <StatCard label="Regressions" value="2" sub="1 critical, 1 major" color="red" />
          <StatCard label="Cost" value={`$${data.lastRun.totalCost.toFixed(2)}`} sub="Last run" color="amber" />
        </div>
      )}

      {/* SLO Status */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">📊 SLO Status</h2>
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[12px] text-ink-300 flex-1">Eval pass rate</span>
            <span className="text-[12px] text-emerald-400 font-mono">92% (target: 90%)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[12px] text-ink-300 flex-1">Zero regressions</span>
            <span className="text-[12px] text-amber-400 font-mono">2 regressions (target: 0)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[12px] text-ink-300 flex-1">Suite duration</span>
            <span className="text-[12px] text-emerald-400 font-mono">28m (target: 30m)</span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Score Trend */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">📈 Score Trend</h2>
          {data.baselines.length > 0 && (
            <div className="space-y-3">
              {data.baselines.slice(0, 5).map((b, i) => (
                <div key={b.id} className="flex items-center gap-3">
                  <div className="w-full">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-ink-300 font-mono">{b.timestamp.slice(0, 10)}</span>
                      <span className="text-white font-mono">{(b.avgScore * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all"
                        style={{ width: `${b.avgScore * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regressions */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-white tracking-tight">🔴 Recent Regressions</h2>
            {data.pendingReviews > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-mono border border-amber-500/20">
                {data.pendingReviews} pending review
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-300">coding-007</span>
              <span className="text-red-400 font-mono">0.95 → 0.72 (-0.23)</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-300">debugging-003</span>
              <span className="text-amber-400 font-mono">0.88 → 0.81 (-0.07)</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-300">refactoring-005</span>
              <span className="text-emerald-400 font-mono">0.82 → 0.91 (+0.09) improvement</span>
            </div>
          </div>
        </div>
      </div>

      {/* Baselines Table */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">💾 Recent Baselines</h2>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-ink-400 font-mono border-b border-white/[0.06]">
              <th className="text-left py-2 font-normal">ID</th>
              <th className="text-left py-2 font-normal">Model</th>
              <th className="text-left py-2 font-normal">Suite</th>
              <th className="text-right py-2 font-normal">Score</th>
              <th className="text-right py-2 font-normal">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.baselines.map((b) => (
              <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <td className="py-2 text-white font-mono">{b.id.slice(0, 14)}</td>
                <td className="py-2 text-ink-300">{b.model}</td>
                <td className="py-2 text-ink-300">{b.suite}</td>
                <td className="py-2 text-right font-mono text-white">{(b.avgScore * 100).toFixed(0)}%</td>
                <td className="py-2 text-right text-ink-400">{b.timestamp.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phase 6 & 7 & 8 Panel — Three-column layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Golden Dataset */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">🥇 Golden Dataset</h2>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[12px] text-ink-300">Tasks</span>
              <span className="ml-auto text-white font-mono text-[12px]">0</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[12px] text-ink-300">Silver (draft)</span>
              <span className="ml-auto text-white font-mono text-[12px]">0</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-[12px] text-ink-300">Gold (verified)</span>
              <span className="ml-auto text-white font-mono text-[12px]">0</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-[12px] text-ink-300">Cross-validation</span>
              <span className="ml-auto text-white font-mono text-[12px]">-</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <div className="text-[10px] font-mono text-ink-400 space-y-1">
                <div><span className="text-ink-500">$</span> aegis eval golden list</div>
                <div><span className="text-ink-500">$</span> aegis eval golden promote</div>
                <div><span className="text-ink-500">$</span> aegis eval golden audit</div>
              </div>
            </div>
          </div>
        </div>

        {/* Skill Validation */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">🔧 Skill Pipeline</h2>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[12px] text-ink-300">Skills validated</span>
              <span className="ml-auto text-white font-mono text-[12px]">0</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[12px] text-ink-300">Degrading</span>
              <span className="ml-auto text-white font-mono text-[12px]">0</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-[12px] text-ink-300">Failed validation</span>
              <span className="ml-auto text-white font-mono text-[12px]">0</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-[12px] text-ink-300">Avg score</span>
              <span className="ml-auto text-white font-mono text-[12px]">-</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <div className="text-[10px] font-mono text-ink-400 space-y-1">
                <div><span className="text-ink-500">$</span> aegis improve validate list</div>
                <div><span className="text-ink-500">$</span> aegis improve monitor degrading</div>
                <div><span className="text-ink-500">$</span> aegis improve monitor top</div>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Agent */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">🤖 Multi-Agent</h2>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[12px] text-ink-300">Coordination patterns</span>
              <span className="ml-auto text-white font-mono text-[12px]">6</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-[12px] text-ink-300">Scenarios</span>
              <span className="ml-auto text-white font-mono text-[12px]">5</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[12px] text-ink-300">Handoff accuracy</span>
              <span className="ml-auto text-white font-mono text-[12px]">-</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-[12px] text-ink-300">Consensus stability</span>
              <span className="ml-auto text-white font-mono text-[12px]">-</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <div className="text-[10px] font-mono text-ink-400 space-y-1">
                <div><span className="text-ink-500">$</span> aegis eval multi-agent list</div>
                <div><span className="text-ink-500">$</span> aegis eval multi-agent run</div>
                <div><span className="text-ink-500">$</span> aegis eval multi-agent metrics</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CLI Reference */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 className="text-[13px] font-semibold text-white mb-3 tracking-tight">⚡ Quick Commands</h2>
        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval run — Run full eval suite</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval ci — Run CI gate</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval status — Show harness status</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval baseline list — Show baselines</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval calibrate — Run judge calibration</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval golden promote — Promote task to gold</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis improve validate — Validate skill candidates</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis improve monitor — Monitor skill performance</div>
          <div className="text-ink-300"><span className="text-ink-400">$</span> aegis eval multi-agent run — Run multi-agent scenario</div>
        </div>
      </div>
    </div>
  )
}
