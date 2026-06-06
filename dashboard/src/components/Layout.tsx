import { Outlet } from "react-router-dom"
import Sidebar from "./Sidebar"

export default function Layout() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="noise-overlay" />
      <Sidebar />
      <main className="ml-60 min-h-screen relative">
        <Outlet />
      </main>
    </div>
  )
}
