import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"

export default function CTA() {
  return (
    <section className="relative w-full py-24 md:py-32">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="bento-card p-12 md:p-20"
        >
          <h2
            className="text-4xl md:text-6xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.03em" }}
          >
            Stop wrapping. <br />
            <span className="serif-italic font-normal">Start shipping.</span>
          </h2>

          <p className="mt-6 text-neutral-400 max-w-md mx-auto">
            Install in under two minutes. Your first autonomous agent session
            is one command away.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
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
              <span>View on GitHub</span>
            </a>
          </div>

          <div className="mt-10 flex items-center justify-center gap-6 text-[11px] text-neutral-500 font-mono">
            <span>2-MIN SETUP</span>
            <span className="w-1 h-1 rounded-full bg-neutral-700" />
            <span>LOCAL-FIRST</span>
            <span className="w-1 h-1 rounded-full bg-neutral-700" />
            <span>MIT</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
