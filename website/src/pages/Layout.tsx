import { Link, NavLink, Outlet } from "react-router-dom"
import { motion } from "framer-motion"

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Recipes", href: "/#recipes" },
  { label: "Journal", href: "/#journal" },
  { label: "FAQ", href: "/#faq" },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-base text-white overflow-x-hidden font-sans relative">
      <div className="noise-overlay" />

      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pt-5"
      >
        <div className="max-w-6xl mx-auto">
          <nav className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/[0.08] bg-base-elevated/70 backdrop-blur-xl">
            <Link to="/" className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded"
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}
              />
              <span className="text-sm font-medium text-white">Neuron OS</span>
            </Link>

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
              <NavLink
                to="/docs"
                className={({ isActive }) =>
                  `px-3 py-1.5 text-sm transition-colors rounded-md hover:bg-white/5 ${
                    isActive ? "text-white" : "text-neutral-400 hover:text-white"
                  }`
                }
              >
                Docs
              </NavLink>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="https://github.com/KunjShah95/neuron-os"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors font-mono"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
                </svg>
                <span>4.2k</span>
              </a>
              <a href="/#install" className="btn-primary text-xs px-3 py-1.5">
                Get started
              </a>
            </div>
          </nav>
        </div>
      </motion.header>

      <main className="pt-32 pb-20">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.06] py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded"
              style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}
            />
            <span className="text-sm text-neutral-400">Neuron OS</span>
            <span className="text-xs text-neutral-600 ml-2 font-mono">v0.1.0 · MIT</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-neutral-500 font-mono">
            <Link to="/journal" className="hover:text-white transition-colors">Journal</Link>
            <Link to="/docs" className="hover:text-white transition-colors">Docs</Link>
            <a href="https://github.com/KunjShah95/neuron-os" className="hover:text-white transition-colors">GitHub</a>
            <a href="https://discord.gg/neuron-os" className="hover:text-white transition-colors">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
