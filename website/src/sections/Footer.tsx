type FooterLink = { label: string; href: string; external?: boolean }

const linkGroups: { label: string; links: FooterLink[] }[] = [
  {
    label: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Recipes", href: "#recipes" },
      { label: "Demo", href: "#demo" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Getting started", href: "/docs/getting-started" },
      { label: "API reference", href: "/docs/api-reference" },
      { label: "Journal", href: "/journal" },
    ],
  },
  {
    label: "Community",
    links: [
      { label: "GitHub", href: "https://github.com/KunjShah95/neuron-os", external: true },
      { label: "Discord", href: "https://discord.com", external: true },
      { label: "X (Twitter)", href: "https://x.com", external: true },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="relative w-full border-t border-white/[0.06] mt-20">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-5 h-5 rounded"
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}
              />
              <span className="text-sm font-medium text-white">Neuron OS</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed max-w-[200px]">
              The operating system for autonomous AI agents.
            </p>
          </div>

          {linkGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider font-medium mb-3">
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(link.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-sm text-neutral-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 font-mono">
            MIT · 2026
          </p>
          <p className="text-xs text-neutral-500">
            Built by humans, for humans.
          </p>
        </div>
      </div>
    </footer>
  )
}
