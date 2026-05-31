export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  header: Region
  agents: Region
  log: Region
  status: Region
  command: Region
}

export function calculateLayout(rows: number, cols: number): Layout {
  const headerHeight = 1
  const statusHeight = 1
  const commandHeight = 1
  const contentHeight = Math.max(1, rows - headerHeight - statusHeight - commandHeight)
  const agentsWidth = Math.min(30, Math.max(10, Math.floor(cols * 0.25)))
  const dividerWidth = 1

  return {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    agents: { x: 0, y: headerHeight, width: agentsWidth, height: contentHeight },
    log: { x: agentsWidth + dividerWidth, y: headerHeight, width: Math.max(1, cols - agentsWidth - dividerWidth), height: contentHeight },
    status: { x: 0, y: headerHeight + contentHeight, width: cols, height: statusHeight },
    command: { x: 0, y: headerHeight + contentHeight + statusHeight, width: cols, height: commandHeight },
  }
}
