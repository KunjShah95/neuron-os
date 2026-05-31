import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

export function renderCommandBar(state: AppState, region: Region): string {
  const prompt = theme.accent(`$ `)
  const input = state.ui.input
  const cursor = state.dirty ? "\u2588" : " "
  const full = prompt + input + cursor
  return cliTruncate(full, region.width)
}
