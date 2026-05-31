import AnimatedPage from "../components/AnimatedPage"

const jobs = [
  { name: "daily-summary", schedule: "0 9 * * *", goal: "Generate a daily summary of agent activity", agentType: "build", enabled: true },
  { name: "health-check", schedule: "*/15 * * * *", goal: "Run system health checks and report anomalies", agentType: "monitor", enabled: true },
  { name: "memory-cleanup", schedule: "0 2 * * 0", goal: "Clean and deduplicate long-term memory", agentType: "refactor", enabled: false },
]

export default function Cron() {
  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">Scheduled Jobs</h1>
        <p className="text-xs text-surface-500 mt-1">Automated tasks running on schedules</p>
      </div>

      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="text-surface-500 text-sm">No scheduled jobs.</p>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.name}
              className="glass rounded-2xl p-5 card-hover"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${job.enabled ? "bg-emerald-400" : "bg-surface-600"}`} />
                  <div>
                    <h3 className="font-medium text-surface-50 text-sm">{job.name}</h3>
                    <span className="text-[10px] text-surface-500 font-mono">{job.schedule}</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  job.enabled ? "text-emerald-400 bg-emerald-400/10" : "text-surface-600 bg-surface-800"
                }`}>
                  {job.enabled ? "active" : "paused"}
                </span>
              </div>
              <p className="text-xs text-surface-400">{job.goal}</p>
              {job.agentType && (
                <span className="text-[10px] text-cyan-400/60 bg-cyan-400/5 px-2 py-0.5 rounded-full mt-2 inline-block">
                  agent: {job.agentType}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </AnimatedPage>
  )
}
