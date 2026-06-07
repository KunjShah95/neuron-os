import Navbar from "../sections/Navbar"
import Footer from "../sections/Footer"

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base text-white overflow-x-hidden font-sans relative">
      <div className="noise-overlay" />
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-24">
        {children}
      </main>
      <Footer />
    </div>
  )
}
