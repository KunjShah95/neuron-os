import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import HeroMockup from "../components/HeroMockup"

export default function SiteHome() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-900 to-surface-950 text-surface-50 py-20">
      <div className="max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-12">
        <div className="flex-1">
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl lg:text-5xl leading-tight"
          >
            Neuron OS — session-first AI orchestration for teams
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="mt-4 text-surface-300 max-w-xl"
          >
            Record, replay, and ship agent-driven workflows with a developer-first
            dashboard and composable runtime. Built for reproducibility and clarity.
          </motion.p>

          <div className="mt-6 flex items-center gap-4">
            <Link to="/site/demo" className="btn btn-primary">Try the demo</Link>
            <Link to="/docs" className="btn btn-outline">Read docs</Link>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-4">
            <div className="p-4 bg-surface-800/60 rounded-lg">
              <h3 className="text-sm font-medium">Session Replay</h3>
              <p className="text-xs text-surface-400 mt-2">Replay agent sessions with timelines and annotations.</p>
            </div>
            <div className="p-4 bg-surface-800/60 rounded-lg">
              <h3 className="text-sm font-medium">Extensible Agents</h3>
              <p className="text-xs text-surface-400 mt-2">Plugin-first architecture to add connectors and tools.</p>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/2">
          <HeroMockup />
        </div>
      </div>
    </div>
  )
}
