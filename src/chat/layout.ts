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
}

export function calculateChatLayout(rows: number, cols: number, inputLines: number): ChatLayout {
  const headerHeight = 1
  const hintHeight = 1
  const inputHeight = Math.min(Math.max(1, inputLines), 8) // cap at 8 lines
  const messagesHeight = Math.max(1, rows - headerHeight - inputHeight - hintHeight)

  return {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    messages: { x: 0, y: headerHeight, width: cols, height: messagesHeight },
    input: { x: 0, y: headerHeight + messagesHeight, width: cols, height: inputHeight },
    hint: { x: 0, y: headerHeight + messagesHeight + inputHeight, width: cols, height: hintHeight },
  }
}
