import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { navGroups, docTopics, defaultTopic } from "../data/docTopics"

const toneClass: Record<string, string> = {
  comment: "text-white/40",
  default: "text-white",
  blank: "",
}

export default function DocsSection() {
  const [activeNav, setActiveNav] = useState<string>("Quickstart")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(navGroups.map((g) => g.label))
  )

  const content = docTopics[activeNav] ?? defaultTopic

  // Filter topics based on search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return navGroups

    const query = searchQuery.toLowerCase()
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.toLowerCase().includes(query) ||
            docTopics[item]?.description.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [searchQuery])

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const group = navGroups.find((g) => g.items.includes(activeNav))

  return (
    <section id="docs" className="relative w-full min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Documentation
              </h1>
              <p className="text-sm text-white/40 mt-1">
                Complete reference for all Neuron OS commands and features
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/KunjShah95/neuron-os"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/50 hover:text-white transition-colors"
              >
                GitHub ↗
              </a>
              <a
                href="#"
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white transition-colors"
              >
                Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex min-h-[calc(100vh-80px)]">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/5 flex-shrink-0">
          <div className="sticky top-0 h-screen overflow-y-auto">
            {/* Search */}
            <div className="p-4 border-b border-white/5">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">
                  ⌕
                </span>
                <input
                  type="text"
                  placeholder="Search docs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Navigation */}
            <nav className="p-4">
              {filteredGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center justify-between w-full text-left mb-2"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">
                      {group.label}
                    </span>
                    <span className="text-white/20 text-xs">
                      {expandedGroups.has(group.label) ? "−" : "+"}
                    </span>
                  </button>

                  <AnimatePresence>
                    {expandedGroups.has(group.label) && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {group.items.map((item) => (
                          <li key={item}>
                            <button
                              onClick={() => setActiveNav(item)}
                              className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-all ${
                                activeNav === item
                                  ? "bg-white/10 text-white"
                                  : "text-white/50 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              {item}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNav}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-8"
            >
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-white/30 mb-4">
                <span>Docs</span>
                <span>/</span>
                <span>{group?.label}</span>
                <span>/</span>
                <span className="text-white/60">{activeNav}</span>
              </div>

              {/* Title */}
              <h2 className="text-3xl font-semibold text-white mb-4 tracking-tight">
                {activeNav}
              </h2>

              {/* Description */}
              <p className="text-white/60 text-base leading-relaxed mb-8 max-w-3xl">
                {content.description}
              </p>

              {/* Code Example */}
              <div className="rounded-xl overflow-hidden border border-white/10 mb-8">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border-b border-white/10">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  </div>
                  <span className="text-xs text-white/30 ml-2 font-mono">
                    terminal
                  </span>
                </div>
                <pre className="p-5 bg-black/50 font-mono text-sm leading-relaxed overflow-x-auto">
                  {content.codeLines.map((line, i) => (
                    <div key={i} className={toneClass[line.tone]}>
                      {line.tone === "blank" ? (
                        <span>&nbsp;</span>
                      ) : line.tone === "comment" ? (
                        <span className="text-white/30">{line.text}</span>
                      ) : (
                        <span>
                          <span className="text-white/30">$ </span>
                          {line.text}
                        </span>
                      )}
                    </div>
                  ))}
                </pre>
              </div>

              {/* Reference Table */}
              {content.tableRows.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-white mb-4">
                    Reference
                  </h3>
                  <div className="rounded-xl border border-white/10 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/10">
                          <th className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-white/40">
                            Command
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-white/40">
                            Type
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-white/40">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {content.tableRows.map((row, i) => (
                          <tr
                            key={i}
                            className={`border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors`}
                          >
                            <td className="px-4 py-3">
                              <code className="text-sm font-mono text-cyan-400">
                                {row.name}
                              </code>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
                                {row.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white/60">
                              {row.desc}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Navigation Links */}
              <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
                {(() => {
                  // Find prev/next items
                  const allItems = navGroups.flatMap((g) => g.items)
                  const currentIndex = allItems.indexOf(activeNav)
                  const prev = currentIndex > 0 ? allItems[currentIndex - 1] : null
                  const next =
                    currentIndex < allItems.length - 1
                      ? allItems[currentIndex + 1]
                      : null

                  return (
                    <>
                      {prev ? (
                        <button
                          onClick={() => setActiveNav(prev)}
                          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
                        >
                          <span className="text-white/30">←</span>
                          {prev}
                        </button>
                      ) : (
                        <div />
                      )}
                      {next ? (
                        <button
                          onClick={() => setActiveNav(next)}
                          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
                        >
                          {next}
                          <span className="text-white/30">→</span>
                        </button>
                      ) : (
                        <div />
                      )}
                    </>
                  )
                })()}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </section>
  )
}
