import { Component, type ReactNode, type ErrorInfo } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React error boundary that catches rendering errors and displays
 * a fallback UI instead of crashing the entire dashboard.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught rendering error:", error.message, errorInfo.componentStack)
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center min-h-[200px] p-8">
          <div className="glass rounded-2xl p-8 max-w-md text-center">
            <div className="text-4xl mb-4 opacity-40">⚠</div>
            <h2 className="text-lg font-display text-surface-50 mb-2">Something went wrong</h2>
            <p className="text-sm text-surface-500 mb-4">
              {this.state.error?.message || "An unexpected error occurred while rendering this section."}
            </p>
            <div className="text-[10px] text-surface-600 font-mono mb-6 px-3 py-2 bg-surface-800/40 rounded-lg truncate">
              {this.state.error?.name || "Error"}
            </div>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium hover:bg-amber-500/20 transition-all"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
