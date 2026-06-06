import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

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
  { label: "Architecture", href: "#architecture" },
  { label: "Demo", href: "#demo" },
  { label: "Stack", href: "#stack" },
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
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    setMobileOpen(false)
  }

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
        scrolled ? "py-3" : "py-6"
      }`}
    >
      <div className={`max-w-6xl mx-auto px-6 flex items-center justify-between transition-all duration-500`}>
        {/* Wordmark */}
        <a
          href="#top"
          onClick={(e) => handleAnchorClick(e, "#top")}
          className="flex items-center gap-2.5 group relative z-50"
        >
          <span className="text-[15px] font-semibold tracking-tight text-white select-none">
            Neuron OS
            <sup className="text-[9px] ml-0.5 align-super opacity-50">™</sup>
          </span>
        </a>

        {/* Center nav — liquid glass pill */}
        <nav className="hidden md:flex liquid-glass rounded-full px-2 py-2 items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleAnchorClick(e, link.href)}
              className="text-[11px] font-medium tracking-[0.12em] text-white/80 hover:text-white px-4 py-1.5 rounded-full transition-colors duration-200"
            >
              {link.label.toUpperCase()}
            </a>
          ))}
        </nav>

        {/* CTA — liquid glass pill */}
        <a
          href="/"
          className="hidden md:inline-block liquid-glass rounded-full px-5 py-2.5 text-[11px] font-medium tracking-[0.12em] text-white/85 hover:text-white transition-colors duration-200"
        >
          OPEN CONSOLE
        </a>

        {/* Mobile toggle */}
        <button
          className="md:hidden liquid-glass p-2.5 rounded-full text-white/80 hover:text-white transition-colors relative z-50"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <XIcon size={16} /> : <MenuIcon size={16} />}
        </button>
      </div>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden bg-black/95 backdrop-blur-xl border-t border-white/[0.05] overflow-hidden"
          >
            <div className="px-6 py-8 flex flex-col gap-6 items-center">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleAnchorClick(e, link.href)}
                  className="text-[12px] font-medium tracking-[0.15em] text-white/70 hover:text-white transition-colors"
                >
                  {link.label.toUpperCase()}
                </a>
              ))}
              <a
                href="/"
                className="w-full text-center bg-white text-black rounded-full py-3 text-[12px] font-semibold tracking-[0.12em]"
              >
                OPEN CONSOLE
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
