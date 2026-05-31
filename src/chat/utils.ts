/**
 * Wrap text to fit within a given width, breaking at word boundaries.
 * Preserves existing newlines as explicit line breaks.
 * Avoids trailing whitespace on lines.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return []

  const lines: string[] = []

  // Split by existing newlines first
  const paragraphs = text.split("\n")

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push("")
      continue
    }

    // Split into words (keep actual word content, discard pure whitespace)
    const words = para.match(/\S+\s*/g) ?? [para]
    let current = ""

    for (const word of words) {
      const trimmed = word.trimEnd()
      const trailingSpace = word.endsWith(" ") ? " " : word.endsWith("\t") ? "\t" : ""

      if (current.length + trimmed.length > maxWidth && current.length > 0) {
        lines.push(current.trimEnd())
        current = trimmed + trailingSpace
      } else {
        current += word
      }
    }

    if (current.trimEnd().length > 0) {
      lines.push(current.trimEnd())
    }
  }

  return lines
}
