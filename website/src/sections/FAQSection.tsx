import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { EASE_OUT_EXPO, stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import GlassCard from "../components/GlassCard"

interface FAQ {
  q: string
  a: string
}

const faqs: FAQ[] = [
  {
    q: "Does this work with Claude, GPT, and local models?",
    a: "Yes. Neuron OS streams from Anthropic, OpenAI, DeepSeek, Ollama, and any OpenAI-compatible endpoint. Switch providers per task at runtime — no restart, no reindex.",
  },
  {
    q: "Where is my data stored?",
    a: "All sessions, vectors, and audit logs live on your machine in an encrypted local vault. Zero telemetry. No cloud roundtrip unless you explicitly enable a remote sync.",
  },
  {
    q: "Is it production-ready?",
    a: "We're at v0.1.0 and shipping weekly. The core agent loop, session persistence, and audit log are stable. We use it ourselves for production workloads; you should too, with the usual testing.",
  },
  {
    q: "Can I extend it with custom agents?",
    a: "Yes. Define custom agent types via JSON schemas, drop skills into the local registry, or publish to the skills.sh network. Agents compose: build a supervisor out of build + review + reflect.",
  },
  {
    q: "How does it compare to LangChain / AutoGen / CrewAI?",
    a: "We're lower-level and local-first. You get a typed runtime, not a chain DSL. Audit trail is built in, not bolted on. Multi-agent supervision is a primitive, not a framework.",
  },
  {
    q: "What about cost? Is it free?",
    a: "The runtime is MIT-licensed and free forever. You pay only for the model tokens you use. Per-token cost attribution is built in so you can track spend per agent, per session, per project.",
  },
]

function PlusIcon({ open }: { open: boolean }) {
  return (
    <div
      className="relative w-4 h-4 flex-shrink-0"
      style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)", transition: "transform 0.3s var(--ease-out-expo)" }}
    >
      <div
        className="absolute left-1/2 top-0 w-px h-full -translate-x-1/2"
        style={{ background: "rgba(255,255,255,0.5)" }}
      />
      <div
        className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2"
        style={{ background: "rgba(255,255,255,0.5)" }}
      />
    </div>
  )
}

export default function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section id="faq" className="relative w-full max-w-4xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— FAQ"
        tone="cyan"
        title="Questions, answered."
        align="center"
      />

      <motion.div
        className="mt-14 flex flex-col gap-3"
        variants={stagger(0.06)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
      >
        {faqs.map((faq, i) => {
          const open = openIdx === i
          return (
            <motion.div key={i} variants={fadeUp}>
              <GlassCard
                className="overflow-hidden"
                interactive={false}
              >
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="w-full flex items-center gap-4 p-5 text-left cursor-pointer"
                  aria-expanded={open}
                >
                  <span
                    className="font-mono text-ink-500"
                    style={{ fontSize: 11, letterSpacing: "0.18em", minWidth: 32 }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="flex-1 text-white"
                    style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}
                  >
                    {faq.q}
                  </span>
                  <PlusIcon open={open} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="px-5 pb-5 pl-[60px]">
                        <p className="text-ink-300" style={{ fontSize: 14, lineHeight: 1.65 }}>
                          {faq.a}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            </motion.div>
          )
        })}
      </motion.div>

      <div className="mt-10 text-center">
        <p className="text-ink-400 text-sm">
          Still curious?{" "}
          <a href="#" className="text-white hover:text-ink-100 transition-colors underline underline-offset-4">
            Read the docs
          </a>{" "}
          or{" "}
          <a href="https://github.com/KunjShah95/neuron-os/issues" target="_blank" rel="noopener noreferrer" className="text-white hover:text-ink-100 transition-colors underline underline-offset-4">
            open an issue ↗
          </a>
        </p>
      </div>
    </section>
  )
}
