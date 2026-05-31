import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { ChatRegion } from "../layout"
import type { PickerItem } from "../store"

export function renderPicker(
  region: ChatRegion,
  items: PickerItem[],
  selectedIndex: number,
  activeProvider: string,
): string[] {
  const lines: string[] = []
  const maxLines = region.height
  const header = ` Models/Providers `
  lines.push(theme.bold(cliTruncate(header, region.width)))

  for (let i = 0; i < items.length && lines.length < maxLines; i++) {
    const item = items[i]
    if (!item) continue
    const isSelected = i === selectedIndex
    const prefix = isSelected ? ">" : " "
    if (item.kind === "provider") {
      const label = item.active ? theme.accent(prefix + " " + item.name) : theme.muted(prefix + " " + item.name)
      lines.push(cliTruncate(label, region.width))
    } else {
      const indent = "  "
      const label = isSelected ? theme.text(indent + item.label) : theme.muted(indent + item.label)
      lines.push(cliTruncate(label, region.width))
    }
  }

  while (lines.length < maxLines) {
    lines.push("")
  }

  return lines
}
