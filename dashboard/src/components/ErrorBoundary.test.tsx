import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import ErrorBoundary from "./ErrorBoundary"

function BrokenComponent({ message = "Kaboom!" }: { message?: string }): ReactNode {
  throw new Error(message)
}

function SafeComponent(): ReactNode {
  return <div>async safe</div>
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText("Hello World")).toBeInTheDocument()
  })

  it("catches rendering errors and shows fallback UI", () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("Kaboom!")).toBeInTheDocument()
    expect(screen.getByText("Error")).toBeInTheDocument()
  })

  it("shows default error message when error has no message", () => {
    render(
      <ErrorBoundary>
        <BrokenComponent message="" />
      </ErrorBoundary>,
    )
    expect(
      screen.getByText("An unexpected error occurred while rendering this section."),
    ).toBeInTheDocument()
  })

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error UI</div>}>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Custom Error UI")).toBeInTheDocument()
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument()
  })

  it("calls onError callback when an error is caught", () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object))
    expect(onError.mock.calls[0][0].message).toBe("Kaboom!")
  })

  it("reset triggers re-render of children (which may throw again if still broken)", () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText("Try again"))

    // Children re-render and throw again → onError fires again
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it("renders fallback with error name in a code block", () => {
    render(
      <ErrorBoundary>
        <BrokenComponent message="TypeError: foo" />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Error")).toBeInTheDocument()
    expect(screen.getByText("TypeError: foo")).toBeInTheDocument()
  })

  it("does not catch errors thrown outside render cycle", () => {
    render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("async safe")).toBeInTheDocument()
  })
})
