import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"

const tiers = [
  {
    name: "Community",
    price: "$0",
    period: "forever",
    desc: "All OSS features, local-first, MIT licensed.",
    features: [
      "13 provider integrations",
      "Vector memory & search",
      "Session replay & traces",
      "MCP native support",
      "TUI & CLI",
      "Community Discord",
    ],
    cta: "View on GitHub",
    href: "https://github.com/KunjShah95/neuron-os",
    btnClass: "btn-secondary",
    featured: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/dev / month",
    desc: "For teams who need control, scale, and support.",
    features: [
      "Everything in Community",
      "RBAC & team vaults",
      "Encrypted sync",
      "Distributed runtime",
      "99.9% SLO",
      "Priority support",
    ],
    cta: "Start free trial",
    href: "#install",
    btnClass: "btn-accent",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For organizations at scale. Volume pricing, SSO, SLAs.",
    features: [
      "Everything in Pro",
      "SSO / SAML / OIDC",
      "Audit log exports",
      "Dedicated support engineer",
      "Custom integrations",
      "SLA guarantees",
    ],
    cta: "Contact us",
    href: "/#contact",
    btnClass: "btn-secondary",
    featured: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="section-label mb-3 inline-block">PRICING</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Simple pricing.{" "}
            <span className="serif-italic font-normal text-neutral-400">No surprises.</span>
          </h2>
        </div>

        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start"
        >
          {tiers.map((tier) => (
            <motion.div
              key={tier.name}
              variants={fadeUp}
              className={`bento-card p-8 md:p-10 flex flex-col relative ${
                tier.featured ? "border-blue-500/30 md:-mt-4 md:mb-[-16px]" : ""
              }`}
            >
              {tier.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-gradient-accent text-[10px] text-white font-medium px-3 py-1 rounded-full uppercase tracking-wider">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-lg font-medium text-white mb-1">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-4xl font-medium text-white">{tier.price}</span>
                  {tier.period && (
                    <span className="text-sm text-neutral-400">{tier.period}</span>
                  )}
                </div>
                <p className="text-sm text-neutral-400 mt-3 leading-relaxed">{tier.desc}</p>
              </div>

              <ul className="space-y-3 mb-10 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-neutral-300">
                    <svg
                      className="w-4 h-4 text-blue-400 mt-0.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={tier.href}
                {...(tier.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`${tier.btnClass} text-center w-full inline-flex items-center justify-center gap-2`}
              >
                {tier.cta}
              </a>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
