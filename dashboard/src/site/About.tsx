export default function SiteAbout() {
  return (
    <div className="min-h-screen py-24 bg-surface-950 text-surface-50">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="font-display text-3xl mb-4">About Neuron OS</h2>
        <p className="text-surface-300 leading-relaxed">Neuron OS was created to make agent-driven development reproducible and auditable. We believe sessions, provenance, and motion-driven UX reduce cognitive load and help teams ship reliable AI features.</p>

        <section className="mt-8">
          <h3 className="text-xl mb-2">Why we built it</h3>
          <p className="text-surface-300">Existing tools focus on models and experiments, but not on session playback, developer ergonomics, and reproducibility. Neuron OS fills that gap.</p>
        </section>

        <section className="mt-8">
          <h3 className="text-xl mb-2">Differentiation</h3>
          <ul className="list-disc pl-6 text-surface-300">
            <li>Session-first UX: full replay and timeline.</li>
            <li>Plugin-first orchestration.</li>
            <li>Motion-rich, informative animations that don't distract.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
