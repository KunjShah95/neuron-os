import { Outlet } from "react-router-dom"
import Sidebar from "./Sidebar"

export default function Layout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="ml-56 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
