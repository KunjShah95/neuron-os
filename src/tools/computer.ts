import type { Tool } from "./registry"
import { execSync } from "node:child_process"
import { readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function takeScreenshot(): string {
  const tmp = join(tmpdir(), `aegis-screen-${Date.now()}.png`)
  const platform = process.platform
  if (platform === "darwin") {
    execSync(`screencapture -x -C "${tmp}"`, { timeout: 10000 })
  } else if (platform === "linux") {
    try { execSync(`import -window root "${tmp}"`, { timeout: 10000 }) }
    catch { try { execSync(`maim "${tmp}"`, { timeout: 10000 }) } catch { return "" } }
  } else if (platform === "win32") {
    execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $bmp = [Drawing.Bitmap]::new([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $gfx = [Drawing.Graphics]::FromImage($bmp); $gfx.CopyFromScreen(0, 0, 0, 0, $bmp.Size); $bmp.Save('${tmp}')"`, { timeout: 15000 })
  }
  const data = readFileSync(tmp)
  // Best-effort cleanup of temp screenshot
  try { unlinkSync(tmp) } catch {}
  return data.toString("base64")
}

function mouseAction(action: string, x?: number, y?: number): void {
  const platform = process.platform
  if (platform === "darwin") {
    if (action === "mouse_move") {
      execSync(`osascript -e 'tell application "System Events" to set position of mouse to {${x},${y}}'`, { timeout: 5000 })
    } else {
      execSync(`osascript -e 'tell application "System Events" to click at {${x},${y}}'`, { timeout: 5000 })
    }
  } else if (platform === "linux") {
    if (action === "mouse_move") {
      execSync(`xdotool mousemove ${x} ${y}`, { timeout: 5000 })
    } else {
      execSync(`xdotool click 1`, { timeout: 5000 })
    }
  } else if (platform === "win32") {
    const script = action === "mouse_move"
      ? `[System.Windows.Forms.Cursor]::Position = New-Object Drawing.Point(${x},${y})`
      : `[System.Windows.Forms.Cursor]::Position = New-Object Drawing.Point(${x},${y}); [System.Windows.Forms.SendKeys]::SendWait('{Click}')`
    execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; ${script}"`, { timeout: 10000 })
  }
}

function typeText(text: string): void {
  const escaped = JSON.stringify(text)
  const platform = process.platform
  if (platform === "darwin") {
    execSync(`osascript -e 'tell application "System Events" to keystroke ${escaped}'`, { timeout: 5000 })
  } else if (platform === "linux") {
    execSync(`xdotool type -- ${escaped}`, { timeout: 5000 })
  } else {
    execSync(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(${escaped})"`, { timeout: 5000 })
  }
}

function keypressFn(key: string): void {
  const platform = process.platform
  if (platform === "linux") {
    execSync(`xdotool key ${key}`, { timeout: 5000 })
  } else if (platform === "win32") {
    const keyMap: Record<string, string> = { enter: "{ENTER}", tab: "{TAB}", escape: "{ESC}", backspace: "{BACKSPACE}", up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}" }
    const k = keyMap[key] || key
    execSync(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${k}')"`, { timeout: 5000 })
  } else {
    const keyMap: Record<string, string> = { enter: "36", tab: "48", escape: "53", backspace: "51" }
    const code = keyMap[key] || key
    execSync(`osascript -e 'tell application "System Events" to key code ${code}'`, { timeout: 5000 })
  }
}

function scrollFn(_y: number): void {
  if (process.platform === "linux") {
    execSync(`xdotool click 4`, { timeout: 3000 })
  }
}

export const computerTool: Tool = {
  name: "computer",
  description: "Control the computer — view screen, move mouse, click, type, scroll, press keys",
  parameters: [
    { name: "action", type: "string", description: "Action: screenshot, mouse_move, left_click, right_click, double_click, drag, type, keypress, scroll", required: true },
    { name: "coordinate", type: "array", description: "[x, y] for mouse actions", required: false },
    { name: "text", type: "string", description: "Text to type", required: false },
    { name: "key", type: "string", description: "Key combo like ctrl+s, enter", required: false },
    { name: "duration", type: "number", description: "Scroll duration in ms", required: false },
  ],
  async execute(params) {
    const action = params.action as string
    const coord = params.coordinate as [number, number] | undefined
    const text = params.text as string | undefined
    const key = params.key as string | undefined
    try {
      switch (action) {
        case "screenshot": {
          const b64 = takeScreenshot()
          if (!b64) return { success: false, output: "", error: "Screenshot capture failed — no screen available" }
          return { success: true, output: `data:image/png;base64,${b64}` }
        }
        case "mouse_move":
          if (!coord) return { success: false, output: "", error: "coordinate required for mouse_move" }
          mouseAction("mouse_move", coord[0], coord[1])
          return { success: true, output: `Mouse moved to (${coord[0]}, ${coord[1]})` }
        case "left_click":
          if (coord) mouseAction("left_click", coord[0], coord[1])
          else mouseAction("left_click", 0, 0)
          return { success: true, output: coord ? `Left click at (${coord[0]}, ${coord[1]})` : "Left click" }
        case "right_click":
          mouseAction("right_click", coord?.[0], coord?.[1])
          return { success: true, output: "Right click performed" }
        case "double_click":
          mouseAction("left_click", coord?.[0], coord?.[1])
          mouseAction("left_click", coord?.[0], coord?.[1])
          return { success: true, output: "Double click performed" }
        case "drag":
          if (!coord) return { success: false, output: "", error: "coordinate required for drag" }
          mouseAction("mouse_move", coord[0], coord[1])
          mouseAction("left_click", coord[0], coord[1])
          return { success: true, output: `Dragged to (${coord[0]}, ${coord[1]})` }
        case "type":
          if (!text) return { success: false, output: "", error: "text required for type" }
          typeText(text)
          return { success: true, output: `Typed: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}` }
        case "keypress":
          if (!key) return { success: false, output: "", error: "key required for keypress" }
          keypressFn(key)
          return { success: true, output: `Pressed: ${key}` }
        case "scroll":
          scrollFn(coord?.[1] || 0)
          return { success: true, output: "Scrolled" }
        default:
          return { success: false, output: "", error: `Unknown action: ${action}` }
      }
    } catch (err) {
      return { success: false, output: "", error: err instanceof Error ? err.message : String(err) }
    }
  },
}
