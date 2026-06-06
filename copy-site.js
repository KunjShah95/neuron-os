import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'website', 'src');
const destDir = path.join(__dirname, 'dashboard', 'src', 'site', 'components');
const homeDest = path.join(__dirname, 'dashboard', 'src', 'site', 'Home.tsx');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// 1. Copy ScrollReveal.tsx
const srPath = path.join(srcDir, 'components', 'ScrollReveal.tsx');
const srDest = path.join(destDir, 'ScrollReveal.tsx');
if (fs.existsSync(srPath)) {
  fs.copyFileSync(srPath, srDest);
  console.log(`Copied ${srPath} -> ${srDest}`);
}

// 2. Copy all sections
const sectionsDir = path.join(srcDir, 'sections');
if (fs.existsSync(sectionsDir)) {
  const files = fs.readdirSync(sectionsDir);
  for (const file of files) {
    const filePath = path.join(sectionsDir, file);
    const destPath = path.join(destDir, file);
    fs.copyFileSync(filePath, destPath);
    console.log(`Copied ${filePath} -> ${destPath}`);

    // Update imports in the copied file
    let content = fs.readFileSync(destPath, 'utf8');
    content = content.replace(/import ScrollReveal from "\.\.\/components\/ScrollReveal"/g, 'import ScrollReveal from "./ScrollReveal"');
    fs.writeFileSync(destPath, content, 'utf8');
  }
}

// 3. Write Home.tsx
const homeContent = `import GridBackground from "./components/GridBackground"
import Navbar from "./components/Navbar"
import HeroSection from "./components/HeroSection"
import FeaturesGrid from "./components/FeaturesGrid"
import ArchitectureSection from "./components/ArchitectureSection"
import TerminalDemo from "./components/TerminalDemo"
import MetricsSection from "./components/MetricsSection"
import TechStack from "./components/TechStack"
import CTASection from "./components/CTASection"
import Footer from "./components/Footer"

export default function SiteHome() {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden font-body">
      <div className="noise-overlay" />
      <GridBackground />

      <div className="relative z-10">
        <Navbar />
        <HeroSection />
        <div className="bg-black/85 backdrop-blur-md">
          <FeaturesGrid />
          <ArchitectureSection />
          <TerminalDemo />
          <MetricsSection />
          <TechStack />
          <CTASection />
          <Footer />
        </div>
      </div>
    </div>
  )
}
`;

fs.writeFileSync(homeDest, homeContent, 'utf8');
console.log(`Wrote Home.tsx -> ${homeDest}`);
