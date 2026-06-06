import { NavLink } from "react-router-dom"
import { motion } from "framer-motion"
import type { NavItem } from "../api/types"
import ProjectSelector from "./ProjectSelector"

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
]

export default function Sidebar() {
  return (
    <aside className="w-60 h-screen fixed left-0 top-0 z-50 flex flex-col">
      <div className="absolute inset-0 glass" />
      <div className="absolute inset-y-0 right-0 w-px bg-white/[0.05]" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="px-5 pt-7 pb-5 hairline-b">
          <h1 className="font-display text-[15px] tracking-tight text-white">
            Neuron OS
            <sup className="text-[8px] ml-0.5 align-super text-white/40">™</sup>
          </h1>
          <p className="text-[9px] text-white/30 uppercase tracking-[0.2em] mt-1.5 font-mono">
            Command Center · v0.1
          </p>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-5 py-2.5 text-[13px] transition-all duration-200 group ${
                  isActive
                    ? "text-white"
                    : "text-ink-300 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="active-nav"
                      className="absolute inset-0 my-1.5 mx-3 rounded-lg bg-white/[0.04] border border-white/[0.06]"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <motion.span
                    initial={false}
                    animate={isActive ? { scale: 1.05 } : { scale: 1 }}
                    className={`relative w-5 text-center text-[14px] ${
                      isActive ? "text-white" : "text-ink-400 group-hover:text-ink-200"
                    }`}
                  >
                    {item.icon}
                  </motion.span>
                  <span className="relative font-medium tracking-[-0.005em]">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <ProjectSelector />
      </div>
    </aside>
  )
}
