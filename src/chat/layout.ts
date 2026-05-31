export interface ChatRegion {
  x: number
  y: number
  width: number
  height: number
}

const PICKER_WIDTH = 34

export interface ChatLayout {
  header: ChatRegion
  messages: ChatRegion
  input: ChatRegion
  hint: ChatRegion
  picker?: ChatRegion
}

export function calculateChatLayout(rows: number, cols: number, inputLines: number, showPicker?: boolean): ChatLayout {
  const headerHeight = 1
  const hintHeight = 1
  const inputHeight = Math.min(Math.max(1, inputLines), 8)
  const messagesHeight = Math.max(1, rows - headerHeight - inputHeight - hintHeight)
  const mainWidth = showPicker ? cols - PICKER_WIDTH - 1 : cols

  const layout: ChatLayout = {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    messages: { x: 0, y: headerHeight, width: mainWidth, height: messagesHeight },
    input: { x: 0, y: headerHeight + messagesHeight, width: mainWidth, height: inputHeight },
    hint: { x: 0, y: headerHeight + messagesHeight + inputHeight, width: mainWidth, height: hintHeight },
  }

  if (showPicker) {
    layout.picker = { x: cols - PICKER_WIDTH, y: headerHeight, width: PICKER_WIDTH, height: rows - headerHeight }
  }

  return layout
}
