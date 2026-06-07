import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { fadeUp, stagger } from "../lib/motion"

const faqs = [
  {
    q: "How is this different from LangChain or AutoGen?",
    a: "Those are libraries you import. Neuron OS is a runtime you install. We give you a process supervisor, a typed agent contract, a session store, a vector index, and a TUI — already wired. No glue code, no graph DSL, no cloud dependency. Just a binary on your machine.",
  },
  {
    q: "Do I need to use Anthropic? Can I run fully local?",
    a: "No. Neuron OS ships with five providers (Anthropic, OpenAI, DeepSeek, Ollama, OpenRouter) and a provider-agnostic tool interface. You can run a 7B model through Ollama and never hit a network. The vault stays on disk, encrypted with your key.",
  },
  {
    q: "What does the “operating system” metaphor actually buy me?",
    a: "Three things: a process model (you spawn, observe, and kill agents like processes), a filesystem (sessions, traces, and memory live as files you can grep, back up, or rsync), and a package manager (agents and skills install via the same `add` command). It's familiar to anyone who's used Unix.",
  },
  {
    q: "Is this production-ready?",
    a: "We're at v0.1.0. The kernel, vault, and CLI are stable. We're shipping the public roadmap at /changelog and dogfooding it on every commit. If something breaks, you have a session replay URL — paste it in the issue tracker and we can reproduce your exact tool-call sequence.",
  },
  {
    q: "Why MIT? What's the catch?",
    a: "No catch. We're a small team that wanted a real agent runtime, didn't find one, and figured other people were tired of wrappers too. The cloud version (if we ever ship one) will be a paid add-on. The local kernel stays free, forever, MIT.",
  },
]

function FAQItem({ q, a, open, onToggle, idx }: { q: string; a: string; open: boolean; onToggle: () => void; idx: number }) {
  return (
    <motion.div
      variants={fadeUp}
      className="border-b border-white/[0.06] last:border-b-0"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-6 py-6 text-left group"
        aria-expanded={open}
      >
        <div className="flex items-start gap-4 flex-1">
          <span className="font-mono text-[11px] text-neutral-600 mt-1 select-none">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <span className="text-base md:text-lg font-medium text-white group-hover:text-blue-400 transition-colors">
            {q}
          </span>
        </div>
        <span
          className={`shrink-0 w-6 h-6 rounded-full border border-white/[0.1] flex items-center justify-center text-neutral-500 transition-transform duration-300 ${
            open ? "rotate-45 border-blue-500/50 text-blue-400" : ""
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pl-10 pr-12 pb-6 text-neutral-400 text-[15px] leading-relaxed max-w-2xl">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section id="faq" className="relative w-full py-24 md:py-32">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="section-label mb-3 inline-block">FAQ</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Questions, <span className="serif-italic font-normal text-neutral-400">answered plainly.</span>
          </h2>
        </div>

        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="border-t border-white/[0.06]"
        >
          {faqs.map((f, i) => (
            <FAQItem
              key={f.q}
              q={f.q}
              a={f.a}
              idx={i}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
