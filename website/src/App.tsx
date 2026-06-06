import Navbar from "./sections/Navbar"
import HeroSection from "./sections/HeroSection"
import FeaturesGrid from "./sections/FeaturesGrid"
import UseCasesSection from "./sections/UseCasesSection"
import ArchitectureSection from "./sections/ArchitectureSection"
import TerminalDemo from "./sections/TerminalDemo"
import DocsSection from "./sections/DocsSection"
import MetricsSection from "./sections/MetricsSection"
import TechStack from "./sections/TechStack"
import ChangelogSection from "./sections/ChangelogSection"
import FAQSection from "./sections/FAQSection"
import CTASection from "./sections/CTASection"
import Footer from "./sections/Footer"

export default function App() {
  return (
    <div className="min-h-screen bg-base text-white overflow-x-hidden font-body relative">
      <div className="noise-overlay" />

      <Navbar />
      <HeroSection />
      <div className="bg-base/85 backdrop-blur-md">
        <FeaturesGrid />
        <UseCasesSection />
        <ArchitectureSection />
        <TerminalDemo />
        <DocsSection />
        <MetricsSection />
        <TechStack />
        <ChangelogSection />
        <FAQSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  )
}
