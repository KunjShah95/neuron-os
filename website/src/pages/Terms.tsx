import LegalLayout from "./LegalLayout"

const sections = [
  {
    title: "Acceptance of Terms",
    content:
      "By accessing or using Neuron OS, you agree to be bound by these Terms of Service. If you do not agree, you may not use the software or any associated services.",
  },
  {
    title: "Description of Service",
    content:
      "Neuron OS is an open-source agent operating system that enables users to build, run, and manage autonomous AI agents. The software is provided in multiple editions: a free Community edition, and paid Pro and Enterprise editions with additional features, support, and service-level commitments.",
  },
  {
    title: "License",
    content:
      "The Community edition of Neuron OS is licensed under the MIT License, granting you broad freedom to use, modify, and distribute the software. Pro and Enterprise editions are licensed under a separate commercial agreement. Use of proprietary components, plugins, or premium features outside the Community edition requires a valid paid license.",
  },
  {
    title: "Free Tier & Paid Subscriptions",
    content:
      "Neuron OS offers a free Community edition with core functionality. Paid subscriptions (Pro and Enterprise) unlock advanced features, priority support, and commercial usage rights. Subscription fees, if applicable, are billed as agreed at the time of purchase. All fees are non-refundable except as required by applicable law.",
  },
  {
    title: "User Responsibilities",
    content:
      "You are solely responsible for the agents, code, and data you create or run using Neuron OS. You must not use the software for any unlawful purpose or in a manner that violates applicable laws or regulations. You are responsible for maintaining the security of your license keys and credentials.",
  },
  {
    title: "Intellectual Property",
    content:
      "Neuron OS and its original components are copyright of Neuron OS. The Neuron OS name and logo are trademarks. This license does not grant you any right to use the Neuron OS trademarks or branding in your own products or services without prior written permission.",
  },
  {
    title: "Limitation of Liability",
    content:
      "Neuron OS is provided 'as is' without warranty of any kind. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the use of the software. This limitation applies to the fullest extent permitted by applicable law.",
  },
  {
    title: "Termination",
    content:
      "Your rights under these Terms terminate automatically if you fail to comply with any provision. Neuron OS reserves the right to disable access to paid services for non-payment or violation of these terms. Upon termination, you must cease all use of the software and delete all copies.",
  },
  {
    title: "Changes to Terms",
    content:
      "We reserve the right to update these Terms at any time. Changes will be posted on this page with an updated effective date. Continued use of the software after changes constitutes acceptance of the new Terms. For material changes, we will provide notice via email or a notification on our website.",
  },
]

export default function Terms() {
  return (
    <LegalLayout>
      <span className="section-label block mb-4">Legal</span>
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Terms of Service</h1>
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
            For questions about these Terms, please contact us at{" "}
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
