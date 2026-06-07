import type { DocBlock } from "../content/docs"
import type { PostBlock } from "../content/posts"
import { motion } from "framer-motion"
import { fadeUp, stagger } from "../lib/motion"

type Block = DocBlock | PostBlock

interface ArticleRendererProps {
  blocks: Block[]
}

const toneStyles = {
  info: "border-blue-500/30 bg-blue-500/[0.05] text-blue-200",
  warn: "border-amber-500/30 bg-amber-500/[0.05] text-amber-200",
}

function renderBlock(block: Block, idx: number) {
  switch (block.type) {
    case "h2":
      return (
        <h2
          key={idx}
          className="text-2xl md:text-3xl font-medium text-white tracking-tight mt-16 mb-6"
          style={{ letterSpacing: "-0.02em" }}
        >
          {block.text}
        </h2>
      )
    case "h3":
      return (
        <h3
          key={idx}
          className="text-lg font-medium text-white tracking-tight mt-10 mb-4"
        >
          {block.text}
        </h3>
      )
    case "p":
      return (
        <p key={idx} className="text-neutral-300 leading-[1.8] text-[16px] mb-6">
          {block.text}
        </p>
      )
    case "ul":
      return (
        <ul key={idx} className="space-y-3 mb-8 ml-1">
          {(block.items ?? []).map((item, i) => (
            <li
              key={i}
              className="text-neutral-300 leading-[1.7] text-[16px] flex gap-3"
            >
              <span className="text-blue-400 mt-2 shrink-0 w-1 h-1 rounded-full bg-blue-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case "ol":
      return (
        <ol key={idx} className="space-y-3 mb-8 ml-1 counter-reset-[item]">
          {(block.items ?? []).map((item, i) => (
            <li
              key={i}
              className="text-neutral-300 leading-[1.7] text-[16px] flex gap-3"
            >
              <span className="text-blue-400 font-mono text-sm shrink-0 mt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )
    case "code":
      return (
        <div
          key={idx}
          className="my-8 rounded-xl border border-white/[0.06] bg-black/60 overflow-hidden"
        >
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.04]">
            <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
            <span className="ml-2 font-mono text-[10px] text-neutral-600">
              {block.lang ?? "code"}
            </span>
          </div>
          <pre className="px-5 py-4 font-mono text-[13px] leading-relaxed text-neutral-300 overflow-x-auto">
            <code>{block.code}</code>
          </pre>
        </div>
      )
    case "callout": {
      const cls = toneStyles[block.tone ?? "info"]
      return (
        <div
          key={idx}
          className={`my-10 px-5 py-4 rounded-xl border ${cls} text-[15px] leading-relaxed`}
        >
          {block.text}
        </div>
      )
    }
    case "quote":
      return (
        <blockquote
          key={idx}
          className="my-10 pl-5 border-l-2 border-blue-500/50 text-neutral-300 text-[17px] leading-relaxed italic"
        >
          {block.text}
          {block.cite && (
            <footer className="mt-3 text-xs text-neutral-500 not-italic font-mono">
              — {block.cite}
            </footer>
          )}
        </blockquote>
      )
    default:
      return null
  }
}

export default function ArticleRenderer({ blocks }: ArticleRendererProps) {
  return (
    <motion.div
      variants={stagger(0.04)}
      initial="hidden"
      animate="show"
      className="max-w-2xl mx-auto"
    >
      {blocks.map((b, i) => (
        <motion.div key={i} variants={fadeUp}>
          {renderBlock(b, i)}
        </motion.div>
      ))}
    </motion.div>
  )
}
