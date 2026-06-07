const tools = [
  { name: "Claude Code", icon: "⌘" },
  { name: "Cursor", icon: "✦" },
  { name: "VS Code", icon: "◇" },
  { name: "Zed", icon: "◈" },
  { name: "Windsurf", icon: "≈" },
  { name: "JetBrains", icon: "◉" },
  { name: "Sublime", icon: "▣" },
  { name: "Neovim", icon: "◊" },
  { name: "Helix", icon: "◎" },
  { name: "Emacs", icon: "⊡" },
  { name: "Bash", icon: "$" },
  { name: "Tmux", icon: "▤" },
]

export default function EcosystemStrip() {
  return (
    <section className="relative w-full py-20 border-y border-white/[0.06] overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="section-label mb-3 inline-block">MCP-COMPATIBLE</span>
          <h3
            className="text-2xl md:text-3xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Plugs into the tools{" "}
            <span className="serif-italic font-normal text-neutral-400">you already use.</span>
          </h3>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-px bg-white/[0.04] rounded-xl overflow-hidden border border-white/[0.06]">
          {tools.map((t) => (
            <div
              key={t.name}
              className="bg-base aspect-[5/3] flex flex-col items-center justify-center gap-1.5 hover:bg-white/[0.02] transition-colors group"
            >
              <span className="text-2xl text-neutral-500 group-hover:text-blue-400 transition-colors">
                {t.icon}
              </span>
              <span className="text-[11px] font-mono text-neutral-500 group-hover:text-white transition-colors">
                {t.name}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center text-xs text-neutral-500 font-mono">
          + any MCP server you can write a manifest for.{" "}
          <a href="/docs/mcp" className="text-neutral-400 hover:text-white transition-colors">
            Learn how →
          </a>
        </div>
      </div>
    </section>
  )
}
