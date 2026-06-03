import { motion } from "framer-motion"

export default function HeroMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-surface-900/60 rounded-2xl border border-surface-700/40 p-4 shadow-lg"
    >
      <div className="w-full h-64 bg-gradient-to-br from-surface-800 to-surface-700 rounded-lg overflow-hidden">
        <div className="w-full h-full flex items-center justify-center text-surface-500">Dashboard mockup</div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="w-12 h-8 bg-surface-800/40 rounded-md" />
        <div className="w-12 h-8 bg-surface-800/40 rounded-md" />
        <div className="w-12 h-8 bg-surface-800/40 rounded-md" />
      </div>
    </motion.div>
  )
}
