export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  header: Region
  agents: Region
  a2ui: Region
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
  const a2uiWidth = Math.min(30, Math.max(10, Math.floor(cols * 0.20)))
  const dividerWidth = 1

  const agentsEndX = agentsWidth
  const a2uiStartX = agentsEndX + dividerWidth
  const a2uiEndX = a2uiStartX + a2uiWidth
  const logStartX = a2uiEndX + dividerWidth
  const logWidth = Math.max(1, cols - logStartX)

  return {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    agents: { x: 0, y: headerHeight, width: agentsWidth, height: contentHeight },
    a2ui: { x: a2uiStartX, y: headerHeight, width: a2uiWidth, height: contentHeight },
    log: { x: logStartX, y: headerHeight, width: logWidth, height: contentHeight },
    status: { x: 0, y: headerHeight + contentHeight, width: cols, height: statusHeight },
    command: { x: 0, y: headerHeight + contentHeight + statusHeight, width: cols, height: commandHeight },
  }
}
