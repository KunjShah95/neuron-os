export interface ChatRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ChatLayout {
  header: ChatRegion
  messages: ChatRegion
  input: ChatRegion
  hint: ChatRegion
  picker?: ChatRegion
}

export function calculateChatLayout(rows: number, cols: number, inputLines: number, showPicker = false): ChatLayout {
  const headerHeight = 1
  const hintHeight = 1
  const inputHeight = Math.min(Math.max(1, inputLines), 8)
  const pickerWidth = showPicker ? 34 : 0
  const chatWidth = Math.max(1, cols - pickerWidth - (showPicker ? 1 : 0))
  const messagesHeight = Math.max(1, rows - headerHeight - inputHeight - hintHeight)

  return {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    messages: { x: 0, y: headerHeight, width: chatWidth, height: messagesHeight },
    input: { x: 0, y: headerHeight + messagesHeight, width: chatWidth, height: inputHeight },
    hint: { x: 0, y: headerHeight + messagesHeight + inputHeight, width: chatWidth, height: hintHeight },
    picker: showPicker ? { x: chatWidth + 1, y: headerHeight, width: pickerWidth, height: messagesHeight + inputHeight } : undefined,
  }
}
