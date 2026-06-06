import { Outlet } from "react-router-dom"
import Sidebar from "./Sidebar"
import KeyboardShortcutsModal, { useKeyboardShortcutsModal } from "./KeyboardShortcutsModal"

export default function Layout() {
  const [shortcutsOpen, setShortcutsOpen] = useKeyboardShortcutsModal()

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="noise-overlay" />
      <Sidebar />
      <main className="ml-60 min-h-screen relative">
        <Outlet />
      </main>

      {/* Keyboard shortcuts modal */}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Floating ? button — always visible */}
      <button
        onClick={() => setShortcutsOpen(true)}
        className="fixed bottom-5 right-5 z-50 w-8 h-8 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] hover:border-white/[0.1] transition-all flex items-center justify-center font-mono backdrop-blur-sm"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
    </div>
  )
}
