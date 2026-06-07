import { useState } from "react"
import { motion } from "framer-motion"
import { LampContainer } from "../components/Lamp"
import { fadeUp } from "../lib/motion"

export default function Hero() {
  const [copied, setCopied] = useState(false)
  const installCmd = "npx create-neuron-os@latest"

  const copy = async () => {
    await navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="relative w-full">
      <LampContainer>
        <motion.div
          variants={fadeUp}
          className="mt-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11px] text-neutral-400 font-mono"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>v0.1.0 · MIT · Local-first</span>
          <span className="text-neutral-700">·</span>
          <a href="#changelog" className="hover:text-white transition-colors">
            changelog →
          </a>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-8 text-center text-4xl font-medium tracking-tight text-white md:text-6xl lg:text-7xl"
          style={{ letterSpacing: "-0.03em" }}
        >
          Ship agents, <br />
          <span className="serif-italic font-normal text-neutral-400">not wrappers.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-xl text-center text-base text-neutral-400 md:text-lg"
        >
          The operating system for autonomous AI agents. Typed, observable,
          recoverable. Run it like <span className="text-neutral-200 font-mono text-[15px]">tmux</span>, debug it like <span className="text-neutral-200 font-mono text-[15px]">strace</span>, ship it like <span className="text-neutral-200 font-mono text-[15px]">nginx</span>.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-col sm:flex-row items-center gap-3"
        >
          <a href="#install" className="btn-accent inline-flex items-center gap-2">
            <span>Get started</span>
            <span className="text-xs opacity-60">→</span>
          </a>
          <a
            href="https://github.com/KunjShah95/neuron-os"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            <span>4.2k</span>
            <span className="text-neutral-600">·</span>
            <span>Star on GitHub</span>
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          id="install"
          className="mt-10 group relative flex items-center gap-2 pl-4 pr-2 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md max-w-md mx-auto"
        >
          <span className="font-mono text-[13px] text-neutral-500 select-none">$</span>
          <code className="font-mono text-[13px] text-white flex-1 text-left truncate">
            {installCmd}
          </code>
          <button
            onClick={copy}
            aria-label="Copy install command"
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono text-neutral-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all"
          >
            {copied ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>copied</span>
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>copy</span>
              </>
            )}
          </button>
        </motion.div>
      </LampContainer>
    </section>
  )
}
