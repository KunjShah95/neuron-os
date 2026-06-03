export default function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-5 bg-surface-800/40 rounded-2xl border border-surface-700/30">
      <h4 className="font-medium text-lg">{title}</h4>
      <p className="text-surface-400 text-sm mt-2">{desc}</p>
    </div>
  )
}
