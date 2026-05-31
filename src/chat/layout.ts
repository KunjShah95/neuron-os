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

<<<<<<< HEAD
export function calculateChatLayout(rows: number, cols: number, inputLines: number, showPicker = false): ChatLayout {
  const headerHeight = 1
  const hintHeight = 1
  const inputHeight = Math.min(Math.max(1, inputLines), 8)
  const pickerWidth = showPicker ? 34 : 0
  const chatWidth = Math.max(1, cols - pickerWidth - (showPicker ? 1 : 0))
=======
export function calculateChatLayout(rows: number, cols: number, inputLines: number, showPicker?: boolean): ChatLayout {
  const headerHeight = 1
  const hintHeight = 1
  const inputHeight = Math.min(Math.max(1, inputLines), 8)
>>>>>>> 908905d (feat: implement model picker functionality and UI rendering)
  const messagesHeight = Math.max(1, rows - headerHeight - inputHeight - hintHeight)
  const mainWidth = showPicker ? cols - PICKER_WIDTH - 1 : cols

  const layout: ChatLayout = {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
<<<<<<< HEAD
    messages: { x: 0, y: headerHeight, width: chatWidth, height: messagesHeight },
    input: { x: 0, y: headerHeight + messagesHeight, width: chatWidth, height: inputHeight },
    hint: { x: 0, y: headerHeight + messagesHeight + inputHeight, width: chatWidth, height: hintHeight },
    picker: showPicker ? { x: chatWidth + 1, y: headerHeight, width: pickerWidth, height: messagesHeight + inputHeight } : undefined,
=======
    messages: { x: 0, y: headerHeight, width: mainWidth, height: messagesHeight },
    input: { x: 0, y: headerHeight + messagesHeight, width: mainWidth, height: inputHeight },
    hint: { x: 0, y: headerHeight + messagesHeight + inputHeight, width: mainWidth, height: hintHeight },
>>>>>>> 908905d (feat: implement model picker functionality and UI rendering)
  }

  if (showPicker) {
    layout.picker = { x: cols - PICKER_WIDTH, y: headerHeight, width: PICKER_WIDTH, height: rows - headerHeight }
  }

  return layout
}
