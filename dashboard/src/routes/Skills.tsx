import AnimatedPage from "../components/AnimatedPage"

const skills = [
  { name: "TypeScript Mastery", description: "Expert-level TypeScript with strict mode patterns", tags: ["typescript", "patterns"], installs: 1240 },
  { name: "React Component Design", description: "Build accessible, performant React components", tags: ["react", "a11y", "performance"], installs: 980 },
  { name: "Bun Runtime", description: "Optimize for Bun's fast startup and TypeScript support", tags: ["bun", "runtime"], installs: 760 },
  { name: "TUI Development", description: "Terminal UI patterns with ANSI escape sequences", tags: ["tui", "terminal"], installs: 540 },
  { name: "Agent Architecture", description: "Design multi-agent systems with IPC and recovery", tags: ["agents", "architecture", "ipc"], installs: 320 },
]

export default function Skills() {
  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">Skills</h1>
        <p className="text-xs text-surface-500 mt-1">Installed skills trending on skills.sh</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {skills.map((skill, i) => (
          <div
            key={i}
            className="glass rounded-2xl p-5 card-hover"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-medium text-surface-50 text-sm">{skill.name}</h3>
              <span className="text-[10px] text-surface-600">{skill.installs.toLocaleString()} installs</span>
            </div>
            <p className="text-xs text-surface-400 leading-relaxed mb-3">{skill.description}</p>
            <div className="flex gap-2">
              {skill.tags.map((tag) => (
                <span key={tag} className="text-[10px] text-amber-400/70 bg-amber-400/5 px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AnimatedPage>
  )
}
