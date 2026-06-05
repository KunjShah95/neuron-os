import { Route, Routes, useLocation } from "react-router-dom"
import { AnimatePresence } from "framer-motion"
import Layout from "./components/Layout"
import Dashboard from "./routes/Dashboard"
import Chat from "./routes/Chat"
import Agents from "./routes/Agents"
import Memory from "./routes/Memory"
import Skills from "./routes/Skills"
import Status from "./routes/Status"
import Config from "./routes/Config"
import Cron from "./routes/Cron"
import MCP from "./routes/MCP"
import Serve from "./routes/Serve"
import Setup from "./routes/Setup"
import Docs from "./routes/Docs"
import SiteHome from "./site/Home"
import SiteFeatures from "./site/Features"
import SiteDemo from "./site/Demo"
import SiteAbout from "./site/About"
import ErrorBoundary from "./components/ErrorBoundary"
import { ProjectProvider } from "./contexts/ProjectContext"

export default function App() {
  const location = useLocation()

  return (
    <ProjectProvider>
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route element={<Layout />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="chat" element={<ErrorBoundary><Chat /></ErrorBoundary>} />
          <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
          <Route path="memory" element={<ErrorBoundary><Memory /></ErrorBoundary>} />
          <Route path="skills" element={<ErrorBoundary><Skills /></ErrorBoundary>} />
          <Route path="status" element={<ErrorBoundary><Status /></ErrorBoundary>} />
          <Route path="config" element={<ErrorBoundary><Config /></ErrorBoundary>} />
          <Route path="cron" element={<ErrorBoundary><Cron /></ErrorBoundary>} />
          <Route path="mcp" element={<ErrorBoundary><MCP /></ErrorBoundary>} />
          <Route path="serve" element={<ErrorBoundary><Serve /></ErrorBoundary>} />
          <Route path="setup" element={<ErrorBoundary><Setup /></ErrorBoundary>} />
          <Route path="docs" element={<ErrorBoundary><Docs /></ErrorBoundary>} />
          <Route path="site">
            <Route index element={<SiteHome />} />
            <Route path="features" element={<SiteFeatures />} />
            <Route path="demo" element={<SiteDemo />} />
            <Route path="about" element={<SiteAbout />} />
          </Route>
        </Route>
      </Routes>
    </AnimatePresence>
    </ProjectProvider>
  )
}
