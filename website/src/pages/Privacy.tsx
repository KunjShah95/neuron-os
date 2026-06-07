import LegalLayout from "./LegalLayout"

const sections = [
  {
    title: "Information We Collect",
    content:
      "We collect the minimum information necessary to operate and improve Neuron OS. This includes: your email address (if you create an account or purchase a license), license keys to validate your entitlement, and anonymous usage statistics if you opt in. We do not collect, store, or transmit any data from the agents you build or run.",
  },
  {
    title: "How We Use Information",
    content:
      "Your email is used for license verification, account-related communications, and product updates if you opt in. Usage statistics help us improve performance and prioritize features. We never sell your personal data or use it for advertising.",
  },
  {
    title: "Data Storage & Security",
    content:
      "Neuron OS operates on a local-first architecture. Your agent configurations, code, and runtime data remain on your machine and are never sent to our servers. License keys and account information are stored securely using industry-standard encryption practices.",
  },
  {
    title: "Third-Party Services",
    content:
      "Neuron OS allows you to connect to third-party AI providers (such as OpenAI, Anthropic, or others) of your choice. Interactions with those services are governed by their respective privacy policies. We do not receive or process data exchanged between you and those providers.",
  },
  {
    title: "Cookies",
    content:
      "The Neuron OS marketing website does not use cookies or tracking technologies. No analytics scripts, fingerprinting, or third-party trackers are loaded on this site.",
  },
  {
    title: "Your Rights",
    content:
      "If you are located in the European Economic Area, you have the right to access, correct, or delete your personal data under the GDPR. To exercise these rights, contact us at the email below. We will respond within 30 days.",
  },
]

export default function Privacy() {
  return (
    <LegalLayout>
      <span className="section-label block mb-4">Legal</span>
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-neutral-500 mb-12">Last updated: June 2026</p>

      <div className="space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold text-white mb-2">{section.title}</h2>
            <p className="text-neutral-300 leading-relaxed">{section.content}</p>
          </section>
        ))}

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Contact</h2>
          <p className="text-neutral-300 leading-relaxed">
            For questions about this Privacy Policy or to exercise your data rights, contact us at{" "}
            <a
              href="mailto:founders@neuron-os.com"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              founders@neuron-os.com
            </a>
            .
          </p>
        </section>
      </div>
    </LegalLayout>
  )
}
