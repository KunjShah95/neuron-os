import { useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts"
import type { CostSummary } from "../api/client"

interface CostChartProps {
  data: CostSummary | undefined
  isLoading?: boolean
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl p-3 text-xs border border-surface-700/50">
      <p className="text-surface-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-surface-100 font-medium">
          ${entry.value.toFixed(4)}
        </p>
      ))}
    </div>
  )
}

export default function CostChart({ data, isLoading }: CostChartProps) {
  const chartData = useMemo(() => {
    if (!data?.dailyCosts) return []
    return data.dailyCosts.map((d) => ({
      date: d.date.slice(5),
      cost: d.cost,
    }))
  }, [data])

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 h-[300px] flex items-center justify-center">
        <div className="text-surface-500 text-xs">Loading cost data...</div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">
        Spend Over Time (USD)
      </h3>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#F59E0B"
              strokeWidth={2}
              fill="url(#costGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
