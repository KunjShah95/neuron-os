import { useState, useEffect } from "react"
import { motion, useScroll, useSpring } from "framer-motion"

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Recipes", href: "#recipes" },
  { label: "Journal", href: "#journal" },
  { label: "Docs", href: "/docs" },
  { label: "FAQ", href: "#faq" },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6"
        style={{
          paddingTop: scrolled ? "12px" : "20px",
          transition: "padding 0.3s ease",
        }}
      >
        <div className="max-w-5xl mx-auto">
          <nav
            className="flex items-center justify-between px-4 py-2.5 rounded-xl"
            style={{
              background: scrolled ? "rgba(10,10,10,0.7)" : "transparent",
              border: scrolled ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
              backdropFilter: scrolled ? "blur(20px)" : "none",
              WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
            }}
          >
            <a href="#top" className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded"
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}
              />
              <span className="text-sm font-medium text-white">Neuron OS</span>
            </a>

            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors rounded-md hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <a
                href="https://github.com/KunjShah95/neuron-os"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
                </svg>
              </a>
              <a href="#install" className="btn-primary text-xs px-3 py-1.5">
                Get started
              </a>
            </div>
          </nav>
        </div>
      </motion.header>

      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] z-[60] origin-left"
        style={{
          scaleX,
          background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
        }}
      />
    </>
  )
}
