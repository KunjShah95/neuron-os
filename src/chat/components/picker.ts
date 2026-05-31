import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { ChatRegion } from "../layout"
import type { PickerItem } from "../store"

export function renderPicker(region: ChatRegion, items: PickerItem[], selectedIndex: number, currentProvider: string): string[] {
  const lines: string[] = []
  const innerWidth = region.width - 2

  const hSep = box.h.repeat(innerWidth)
  lines.push(theme.accent(hSep.slice(0, 2)) + theme.accent(" Models/Providers ") + theme.accent(hSep.slice(18)))

  const availableHeight = region.height - 2
  const startIdx = Math.max(0, selectedIndex - availableHeight + 1)

  for (let i = 0; i < availableHeight; i++) {
    const itemIdx = startIdx + i
    if (itemIdx >= items.length) {
      lines.push(box.v + " ".repeat(innerWidth) + box.v)
      continue
    }
    const item = items[itemIdx]
    if (!item) continue
    const isSelected = itemIdx === selectedIndex
    const prefix = isSelected ? theme.accent(">") : " "
    let text: string
    if (item.kind === "provider") {
      const marker = item.active ? theme.accent(box.dot) : " "
      text = `${prefix} ${marker} ${theme.bold(item.name)}`
    } else {
      text = `${prefix}   ${item.label}`
    }
    const padded = text.slice(0, innerWidth)
    lines.push(box.v + padded.padEnd(innerWidth, " ") + box.v)
  }

  return lines
}
