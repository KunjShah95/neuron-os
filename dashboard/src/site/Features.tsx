import FeatureCard from "../components/FeatureCard"

const features = [
  { title: "Session Replay", desc: "Record and replay agent sessions with full timeline and metadata." },
  { title: "Extensible Orchestration", desc: "Add plugins and connectors to run custom toolchains." },
  { title: "Local-first Developer UX", desc: "Run, test and iterate locally with Bun-powered builds." },
  { title: "Observability & Auditing", desc: "Audit runs, capture provenance, and share reproducible sessions." },
]

export default function SiteFeatures() {
  return (
    <div className="min-h-screen py-20 bg-surface-950 text-surface-50">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="font-display text-3xl mb-6">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <FeatureCard key={f.title} title={f.title} desc={f.desc} />
          ))}
        </div>
      </div>
    </div>
  )
}
