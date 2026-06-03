import { NavLink } from "react-router-dom"
import { motion } from "framer-motion"
import type { NavItem } from "../api/types"

const navItems: NavItem[] = [
  { path: "/", label: "Console", icon: "◈" },
  { path: "/chat", label: "Chat", icon: "✦" },
  { path: "/agents", label: "Agents", icon: "⬡" },
  { path: "/memory", label: "Memory", icon: "◇" },
  { path: "/skills", label: "Skills", icon: "◇" },
  { path: "/status", label: "Status", icon: "◎" },
  { path: "/config", label: "Config", icon: "⚙" },
  { path: "/cron", label: "Cron", icon: "⏱" },
  { path: "/mcp", label: "MCP", icon: "⊞" },
  { path: "/serve", label: "Server", icon: "↗" },
  { path: "/setup", label: "Setup", icon: "⚡" },
  { path: "/docs", label: "Docs", icon: "?" },
  { path: "/site", label: "Website", icon: "🌐" },
]

export default function Sidebar() {
  return (
    <aside className="w-56 h-screen fixed left-0 top-0 glass border-r border-surface-700/50 flex flex-col z-50">
      <div className="px-5 pt-6 pb-4 border-b border-surface-700/30">
        <h1 className="font-display text-xl tracking-tight">
          <span className="text-amber-400">Aegis</span>
          <span className="text-surface-400 font-body text-xs ml-2">v0.1</span>
        </h1>
        <p className="text-[10px] text-surface-500 uppercase tracking-[0.2em] mt-1">Command Center</p>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm transition-all duration-200 ${
                isActive
                  ? "text-amber-400 bg-amber-400/5 border-r-2 border-amber-400"
                  : "text-surface-400 hover:text-surface-100 hover:bg-surface-800/40"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <motion.span
                  initial={false}
                  animate={isActive ? { scale: 1.1, rotate: 0 } : { scale: 1, rotate: 0 }}
                  className={`w-5 text-center text-sm ${isActive ? "text-amber-400" : "text-surface-500"}`}
                >
                  {item.icon}
                </motion.span>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-surface-700/30">
        <div className="flex items-center gap-2 text-[10px] text-surface-600 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          System Active
        </div>
      </div>
    </aside>
  )
}
