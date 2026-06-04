import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SoundToggle from "./SoundToggle"

vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: any) => {
      const { animate, transition, ...rest } = props
      return <span {...rest}>{children}</span>
    },
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, layout, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

let mockEnabled = true
vi.mock("../hooks/useNotificationSounds", () => ({
  useNotificationSounds: () => ({
    handleEvent: vi.fn(),
    toggleSounds: () => {
      mockEnabled = !mockEnabled
      return mockEnabled
    },
    isEnabled: () => mockEnabled,
  }),
}))

describe("SoundToggle", () => {
  beforeEach(() => {
    mockEnabled = true
    localStorage.clear()
  })

  it("renders with sound enabled by default", () => {
    render(<SoundToggle />)
    expect(screen.getByText("Sound On")).toBeInTheDocument()
    expect(screen.getByTitle("Mute notification sounds")).toBeInTheDocument()
  })

  it("renders muted when disabled", () => {
    mockEnabled = false
    render(<SoundToggle />)
    expect(screen.getByText("Muted")).toBeInTheDocument()
    expect(screen.getByTitle("Enable notification sounds")).toBeInTheDocument()
  })

  it("shows hint popover on mouse enter and hides on leave", () => {
    render(<SoundToggle />)
    const button = screen.getByRole("button")

    expect(screen.queryByText("Notifications on · spawn/kill/error")).not.toBeInTheDocument()
    fireEvent.mouseEnter(button)
    expect(screen.getByText("Notifications on · spawn/kill/error")).toBeInTheDocument()
    fireEvent.mouseLeave(button)
    expect(screen.queryByText("Notifications on · spawn/kill/error")).not.toBeInTheDocument()
  })

  it("shows muted hint when sound is off", () => {
    mockEnabled = false
    render(<SoundToggle />)
    fireEvent.mouseEnter(screen.getByRole("button"))
    expect(screen.getByText("Notifications off · click to enable")).toBeInTheDocument()
  })

  it("applies custom className", () => {
    render(<SoundToggle className="my-custom-class" />)
    const el = screen.getByRole("button").closest('[class*="my-custom-class"]')
    expect(el).toBeTruthy()
  })

  it("calls onChange callback when toggled", () => {
    const onChange = vi.fn()
    render(<SoundToggle onChange={onChange} />)

    // Click toggles mockEnabled from true → false
    fireEvent.click(screen.getByRole("button"))
    expect(onChange).toHaveBeenCalledWith(false)

    // Click toggles from false → true
    fireEvent.click(screen.getByRole("button"))
    expect(onChange).toHaveBeenCalledWith(true)

    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
