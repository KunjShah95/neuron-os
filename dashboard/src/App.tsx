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

export default function App() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="agents" element={<Agents />} />
          <Route path="memory" element={<Memory />} />
          <Route path="skills" element={<Skills />} />
          <Route path="status" element={<Status />} />
          <Route path="config" element={<Config />} />
          <Route path="cron" element={<Cron />} />
          <Route path="mcp" element={<MCP />} />
          <Route path="serve" element={<Serve />} />
          <Route path="setup" element={<Setup />} />
          <Route path="docs" element={<Docs />} />
        </Route>
      </Routes>
    </AnimatePresence>
  )
}
