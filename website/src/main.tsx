import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import App from "./App"
import Layout from "./pages/Layout"
import JournalIndex from "./pages/JournalIndex"
import JournalPost from "./pages/JournalPost"
import DocsIndex from "./pages/DocsIndex"
import DocPage from "./pages/DocPage"
import RecipePage from "./pages/RecipePage"
import NotFound from "./pages/NotFound"
import "./index.css"

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  {
    path: "/",
    element: <Layout />,
    children: [
      { path: "journal", element: <JournalIndex /> },
      { path: "journal/:slug", element: <JournalPost /> },
      { path: "docs", element: <DocsIndex /> },
      { path: "docs/:slug", element: <DocPage /> },
      { path: "docs/recipes/:slug", element: <RecipePage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
