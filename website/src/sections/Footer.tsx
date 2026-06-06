import { motion } from "framer-motion";
import { fadeUp } from "../lib/motion";

type FooterLink = { label: string; href: string; external?: boolean };

type FooterLinkGroup = { label: string; links: FooterLink[] };

const linkGroups: FooterLinkGroup[] = [
  {
    label: "Product",
    links: [
      { label: "Dashboard", href: "/" },
      { label: "Console", href: "/console" },
      { label: "Memory", href: "/memory" },
      { label: "Skills", href: "/skills" },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Changelog", href: "/changelog" },
      { label: "Blog", href: "/blog" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    label: "Community",
    links: [
      { label: "GitHub", href: "https://github.com/KunjShah95/neuron-os", external: true },
      { label: "Discord", href: "https://discord.com", external: true },
      { label: "X (Twitter)", href: "https://x.com", external: true },
      { label: "YouTube", href: "https://youtube.com", external: true },
    ],
  },
  {
    label: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative w-full border-t border-white/[0.06] bg-elevated/40 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {linkGroups.map((group) => (
              <div key={group.label}>
                <p className="font-mono text-ink-500 uppercase tracking-[0.18em] text-[10px] mb-3">
                  {group.label}
                </p>
                {group.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    {...(link.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="text-ink-300 hover:text-white transition-colors text-[13px] block py-1"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-12 mb-6 border-t border-white/[0.05]" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 font-mono text-ink-400 text-[11px]">
              <span className="brand-cube w-5 h-5" />
              <span>Aegis · MIT · 2026</span>
            </div>

            <div className="flex items-center gap-5">
              <a
                href="https://github.com/KunjShah95/neuron-os"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="text-ink-400 hover:text-white transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
                </svg>
              </a>
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="text-ink-400 hover:text-white transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.84l-5.36-7.01L4.16 22H.9l8.04-9.19L1.5 2h7.02l4.84 6.4L18.244 2Zm-1.2 18h1.86L7.05 4H5.06l11.984 16Z" />
                </svg>
              </a>
              <a
                href="https://discord.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="text-ink-400 hover:text-white transition-colors"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.6 14.6 0 0 0-.66 1.355 18.27 18.27 0 0 0-5.486 0A14.6 14.6 0 0 0 9.752 3a19.79 19.79 0 0 0-3.76 1.369C2.43 9.045 1.62 13.58 2.02 18.05a19.9 19.9 0 0 0 6.04 3.06 14.7 14.7 0 0 0 1.27-2.06 12.93 12.93 0 0 1-2-.96c.17-.12.33-.25.49-.38 3.85 1.78 8.02 1.78 11.83 0 .16.13.32.26.49.38-.64.38-1.31.7-2 .96.4.73.83 1.43 1.27 2.06a19.86 19.86 0 0 0 6.04-3.06c.47-5.18-.84-9.66-3.13-13.68ZM9.55 15.57c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.09 2.15 2.42 0 1.33-.95 2.41-2.15 2.41Zm4.9 0c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.09 2.15 2.42 0 1.33-.94 2.41-2.15 2.41Z" />
                </svg>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
