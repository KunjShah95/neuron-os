import { Route, Routes, useLocation } from "react-router-dom"
import { AnimatePresence } from "framer-motion"
import Layout from "./components/Layout"
import Dashboard from "./routes/Dashboard"
import Chat from "./routes/Chat"
import Agents from "./routes/Agents"
import Memory from "./routes/Memory"
import Skills from "./routes/Skills"
import A2uiBoard from "./routes/A2uiBoard"
import A2uiPlayground from "./routes/A2uiPlayground"
import Souls from "./routes/Souls"
import Capabilities from "./routes/Capabilities"
import Status from "./routes/Status"
import Config from "./routes/Config"
import Cron from "./routes/Cron"
import MCP from "./routes/MCP"
import Serve from "./routes/Serve"
import Setup from "./routes/Setup"
import Docs from "./routes/Docs"
import SystemModules from "./routes/SystemModules"
import ErrorBoundary from "./components/ErrorBoundary"
import { ProjectProvider } from "./contexts/ProjectContext"
import { A2uiStreamProvider } from "./contexts/A2uiStreamContext"

export default function App() {
  const location = useLocation()

  return (
    <ProjectProvider>
    <A2uiStreamProvider>
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route element={<Layout />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="chat" element={<ErrorBoundary><Chat /></ErrorBoundary>} />
          <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
          <Route path="a2ui" element={<ErrorBoundary><A2uiBoard /></ErrorBoundary>} />
          <Route path="a2ui/playground" element={<ErrorBoundary><A2uiPlayground /></ErrorBoundary>} />
          <Route path="souls" element={<ErrorBoundary><Souls /></ErrorBoundary>} />
          <Route path="capabilities" element={<ErrorBoundary><Capabilities /></ErrorBoundary>} />
          <Route path="memory" element={<ErrorBoundary><Memory /></ErrorBoundary>} />
          <Route path="skills" element={<ErrorBoundary><Skills /></ErrorBoundary>} />
          <Route path="status" element={<ErrorBoundary><Status /></ErrorBoundary>} />
          <Route path="config" element={<ErrorBoundary><Config /></ErrorBoundary>} />
          <Route path="cron" element={<ErrorBoundary><Cron /></ErrorBoundary>} />
          <Route path="mcp" element={<ErrorBoundary><MCP /></ErrorBoundary>} />
          <Route path="serve" element={<ErrorBoundary><Serve /></ErrorBoundary>} />
          <Route path="setup" element={<ErrorBoundary><Setup /></ErrorBoundary>} />
          <Route path="docs" element={<ErrorBoundary><Docs /></ErrorBoundary>} />
          <Route path="modules" element={<ErrorBoundary><SystemModules /></ErrorBoundary>} />
        </Route>
      </Routes>
    </AnimatePresence>
    </A2uiStreamProvider>
    </ProjectProvider>
  )
}
