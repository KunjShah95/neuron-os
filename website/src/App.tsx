import Navbar from "./sections/Navbar"
import Hero from "./sections/Hero"
import StatsBar from "./sections/StatsBar"
import FeaturesBento from "./sections/FeaturesBento"
import TerminalDemo from "./sections/TerminalDemo"
import ComparisonSection from "./sections/ComparisonSection"
import Timeline from "./sections/Timeline"
import Recipes from "./sections/Recipes"
import Docs from "./sections/Docs"
import Journal from "./sections/Journal"
import Testimonials from "./sections/Testimonials"
import EcosystemStrip from "./sections/EcosystemStrip"
import FAQ from "./sections/FAQ"
import CTA from "./sections/CTA"
import Footer from "./sections/Footer"

export default function App() {
  return (
    <div className="min-h-screen bg-base text-white overflow-x-hidden font-sans relative">
      <div className="noise-overlay" />
      <Navbar />
      <Hero />
      <StatsBar />
      <FeaturesBento />
      <TerminalDemo />
      <ComparisonSection />
      <Timeline />
      <Recipes />
      <Docs />
      <Journal />
      <Testimonials />
      <EcosystemStrip />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  )
}
