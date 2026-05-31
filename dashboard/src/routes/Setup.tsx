import AnimatedPage from "../components/AnimatedPage"

export default function Setup() {
  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">Setup</h1>
        <p className="text-xs text-surface-500 mt-1">Configure Aegis for first use</p>
      </div>

      <div className="glass rounded-2xl p-8 max-w-lg">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h2 className="font-display text-xl text-surface-50 mb-2">Ready to configure</h2>
          <p className="text-xs text-surface-400">
            The setup wizard runs in the terminal. It guides you through provider selection,
            API key entry, and workspace configuration.
          </p>
        </div>

        <div className="space-y-4">
          {[
            { step: 1, label: "Select provider", desc: "Anthropic, OpenAI, DeepSeek, Ollama, or custom" },
            { step: 2, label: "Enter API key", desc: "Your credentials are stored securely in the vault" },
            { step: 3, label: "Choose model", desc: "Pick the default model for chat sessions" },
            { step: 4, label: "Save config", desc: "Settings persisted to ~/.aegis/config.json" },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-4">
              <span className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-[10px] text-amber-400 font-medium shrink-0">
                {s.step}
              </span>
              <div>
                <h3 className="text-sm font-medium text-surface-50">{s.label}</h3>
                <p className="text-xs text-surface-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-surface-700/30">
          <p className="text-[10px] text-surface-600">
            Run in terminal: <span className="font-mono text-surface-500">aegis setup</span>
          </p>
        </div>
      </div>
    </AnimatedPage>
  )
}
