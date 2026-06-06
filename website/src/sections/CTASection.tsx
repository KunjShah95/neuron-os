import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"

export default function CTASection() {
  return (
    <section className="relative w-full px-6 py-24 md:py-32">
      <div className="absolute inset-0 bg-cta-glow pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <div className="glass-card p-12 md:p-20 text-center glass-card-glow-purple">
            <h2
              className="serif-italic text-white"
              style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: 0.98, letterSpacing: "-0.02em" }}
            >
              Stop wrapping. Start shipping.
            </h2>

            <a
              href="/"
              className="btn-landing-gradient mt-9 inline-flex items-center gap-2"
            >
              <span>Install aegis</span>
              <span
                className="font-mono"
                style={{ fontSize: 11, background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}
              >
                ⌘
              </span>
            </a>

            <div className="mt-9 flex items-center justify-center gap-6 text-[10px] tracking-[0.18em] font-mono text-ink-400 flex-wrap">
              <span>2-MIN SETUP</span>
              <span>·</span>
              <span>LOCAL-FIRST</span>
              <span>·</span>
              <span>MIT LICENSED</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
