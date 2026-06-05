import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

export interface Project {
  name: string
  root: string
  createdAt: number
}

interface ProjectContextValue {
  /** Currently selected project name (null = default/no project) */
  currentProject: string | null
  /** Available projects fetched from the server */
  projects: Project[]
  /** Switch the active project */
  setProject: (name: string | null) => void
  /** Loading state for projects list */
  loading: boolean
  /** Whether a project is active */
  hasProject: boolean
}

const STORAGE_KEY = "aegis:dashboard-project"

const ProjectContext = createContext<ProjectContextValue>({
  currentProject: null,
  projects: [],
  setProject: () => {},
  loading: false,
  hasProject: false,
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<string | null>(() => {
    // Restore from localStorage on mount
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY)
    }
    return null
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch available projects from the backend
  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/v1/projects")
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch {
      // Server not available — keep existing list
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const setProject = useCallback((name: string | null) => {
    setCurrentProject(name)
    if (typeof window !== "undefined") {
      if (name) {
        localStorage.setItem(STORAGE_KEY, name)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  return (
    <ProjectContext.Provider
      value={{
        currentProject,
        projects,
        setProject,
        loading,
        hasProject: currentProject !== null,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext)
}
