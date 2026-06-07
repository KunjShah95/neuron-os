import { motion } from "framer-motion"
import { fadeUp, stagger } from "../lib/motion"

interface Recipe {
  slug: string
  tag: string
  title: string
  desc: string
  code: string
  tone: "spawn" | "memory" | "tool"
}

const recipes: Recipe[] = [
  {
    slug: "spawn-an-agent",
    tag: "01 · SPAWN",
    title: "Boot an agent in four lines",
    desc: "No graph DSL, no Yaml config, no boilerplate. One call, one process, one audit trail.",
    tone: "spawn",
    code: `import { spawn } from "neuron-os"

const agent = await spawn({
  type: "builder",
  goal: "Refactor the auth middleware",
  model: "claude-sonnet-4",
})

await agent.run()`,
  },
  {
    slug: "reusable-memory",
    tag: "02 · MEMORY",
    title: "Reuse a fact across every session",
    desc: "Vault, semantic search, and TTL — wired to a single CLI command. Nothing else to import.",
    tone: "memory",
    code: `neuron remember \\
  --kind fact \\
  --ttl 90d \\
  "User prefers tabs over spaces"

$ neuron recall "user preferences"
→ "User prefers tabs over spaces"  (relevance 0.94)`,
  },
  {
    slug: "custom-tool",
    tag: "03 · TOOL",
    title: "Hot-reload a custom tool",
    desc: "Write a tool, save the file, watch it appear in the next tool call. No rebuild, no restart.",
    tone: "tool",
    code: `// ~/.neuron/tools/slack.ts
import { define } from "neuron-os/tool"

export default define({
  name: "post_slack",
  schema: { channel: "string", text: "string" },
  run: async ({ channel, text }) => {
    return fetch(process.env.SLACK_HOOK, {
      method: "POST",
      body: JSON.stringify({ channel, text }),
    })
  },
})`,
  },
]

const toneAccent: Record<Recipe["tone"], string> = {
  spawn: "text-blue-400",
  memory: "text-emerald-400",
  tool: "text-amber-400",
}

export default function Recipes() {
  return (
    <section id="recipes" className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="section-label mb-3 inline-block">RECIPES</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Three patterns.{" "}
            <span className="serif-italic font-normal text-neutral-400">Copy, paste, ship.</span>
          </h2>
          <p className="mt-5 text-neutral-500 text-sm max-w-lg mx-auto">
            The full manual is on the docs site. These three will cover 80%
            of what you build on day one.
          </p>
        </div>

        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
          {recipes.map((r) => (
            <motion.article
              key={r.title}
              variants={fadeUp}
              className="bento-card border-beam group flex flex-col overflow-hidden"
            >
              <div className="p-6 md:p-8 pb-0">
                <div className={`font-mono text-[10px] tracking-widest mb-4 ${toneAccent[r.tone]}`}>
                  {r.tag}
                </div>
                <h3 className="text-lg font-medium text-white tracking-tight mb-2 leading-snug">
                  {r.title}
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {r.desc}
                </p>
              </div>

              <div className="mt-6 mx-6 md:mx-8 mb-6 md:mb-8 rounded-lg border border-white/[0.06] bg-black/60 overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.04]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
                  <span className="ml-2 font-mono text-[10px] text-neutral-600">
                    {r.tone === "spawn" && "agent.ts"}
                    {r.tone === "memory" && "shell"}
                    {r.tone === "tool" && "slack.ts"}
                  </span>
                </div>
                <pre className="px-4 py-4 font-mono text-[11.5px] leading-relaxed text-neutral-300 overflow-x-auto">
                  <code>{r.code}</code>
                </pre>
              </div>

              <div className="px-6 md:px-8 pb-6 md:pb-8 mt-auto">
                <a
                  href={`/docs/recipes/${r.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors font-mono"
                >
                  <span>Read the full recipe</span>
                  <span className="opacity-60 group-hover:translate-x-0.5 transition-transform">→</span>
                </a>
              </div>
            </motion.article>
          ))}
        </motion.div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-neutral-500 font-mono">
          <a href="/docs/getting-started" className="hover:text-white transition-colors">
            /docs/getting-started →
          </a>
          <span className="hidden sm:inline text-neutral-800">·</span>
          <a href="/docs/api-reference" className="hover:text-white transition-colors">
            /docs/api-reference →
          </a>
          <span className="hidden sm:inline text-neutral-800">·</span>
          <a href="/docs" className="hover:text-white transition-colors">
            all docs →
          </a>
        </div>
      </div>
    </section>
  )
}
