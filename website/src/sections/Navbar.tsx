import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { EASE_OUT_EXPO } from "../lib/motion"

function MenuIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 7H20" />
      <path d="M4 12H20" />
      <path d="M4 17H20" />
    </svg>
  )
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 6L18 18" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Docs", href: "#docs" },
  { label: "Stack", href: "#stack" },
  { label: "Changelog", href: "#changelog" },
  { label: "FAQ", href: "#faq" },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleAnchorClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    const el = document.querySelector(href)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    } else if (href.startsWith("#")) {
      window.location.hash = href
    }
    setMobileOpen(false)
  }

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
        scrolled ? "py-3" : "py-6"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-2.5 transition-all duration-500"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 12,
            boxShadow: scrolled ? "0 8px 32px -8px rgba(0,0,0,0.4)" : "none",
          }}
        >
          <a
            href="#top"
            onClick={(e) => handleAnchorClick(e, "#top")}
            className="flex items-center gap-2.5 relative z-50"
          >
            <span className="brand-cube w-6 h-6" />
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Aegis
            </span>
            <span
              className="font-mono text-ink-300 px-1.5 py-0.5"
              style={{ fontSize: 9, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4 }}
            >
              v0.2.0
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-5">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleAnchorClick(e, link.href)}
                className="text-[13px] text-ink-300 hover:text-white transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <span
              className="font-mono text-ink-400 px-2 py-1"
              style={{ fontSize: 11, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}
            >
              ⌘K
            </span>
            <a
              href="https://github.com/KunjShah95/neuron-os"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              title="View source on GitHub"
              className="text-ink-300 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/[0.04]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </a>
            <a
              href="/"
              className="btn-landing-gradient"
              style={{ padding: "7px 14px", fontSize: 12 }}
            >
              Get started
            </a>
          </div>

          <button
            className="md:hidden p-2 text-ink-200 hover:text-white transition-colors relative z-50"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden bg-base/95 backdrop-blur-xl border-t border-white/[0.05] overflow-hidden"
          >
            <div className="px-6 py-8 flex flex-col gap-6 items-center">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleAnchorClick(e, link.href)}
                  className="text-[13px] text-ink-200 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <a href="/" className="btn-landing-gradient w-full text-center">
                Get started
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
