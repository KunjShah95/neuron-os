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
              v0.1.0
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
