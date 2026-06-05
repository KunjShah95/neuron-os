/**
 * Terminal markdown renderer using marked + marked-terminal.
 *
 * Renders markdown content beautifully in the terminal with
 * proper formatting, colors, and styling.
 */

import { marked } from "marked"
import TerminalRenderer from "marked-terminal"
import chalk from "chalk"

// Create terminal renderer with custom options
const terminalRenderer = new TerminalRenderer({
  // Heading styles
  heading: (text: string, level: number): string => {
    const colors = [chalk.white.bold, chalk.white.bold, chalk.cyan.bold, chalk.cyan, chalk.gray, chalk.gray]
    const color = colors[level - 1] || chalk.gray
    const prefix = level <= 2 ? "\n" : ""
    const suffix = "\n"
    return `${prefix}${color(text)}${suffix}`
  },
  
  // Code block styling
  code: (code: string, language?: string): string => {
    const lang = language ? chalk.gray(` ${language} `) : ""
    const header = lang ? chalk.bgGray.white(lang) + "\n" : ""
    const formatted = code
      .split("\n")
      .map(line => "  " + chalk.gray(line))
      .join("\n")
    return `\n${header}${formatted}\n`
  },
  
  // Inline code
  codespan: (code: string): string => {
    return chalk.yellow(code)
  },
  
  // Blockquote
  blockquote: (quote: string): string => {
    return quote
      .split("\n")
      .map(line => chalk.gray("  ▎ ") + line.trim())
      .join("\n") + "\n"
  },
  
  // Lists - use proper signature
  list: (body: string): string => {
    return body
  },
  
  listitem: (text: string): string => {
    return `  ${chalk.cyan("•")} ${text}\n`
  },
  
  // Paragraphs
  paragraph: (text: string): string => {
    return `${text}\n\n`
  },
  
  // Strong and emphasis
  strong: (text: string): string => chalk.bold.white(text),
  em: (text: string): string => chalk.italic(text),
  
  // Links - use proper signature with 3 params
  link: (href: string, _title: string, text: string): string => {
    return chalk.blue.underline(text || href)
  },
  
  // Tables - use proper signature
  table: (header: string, body: string): string => {
    return `\n${header}${body}\n`
  },
  
  tablerow: (content: string): string => {
    return `${content}\n`
  },
  
  tablecell: (content: string, flags: { header?: boolean }): string => {
    const padding = "  "
    if (flags.header) {
      return padding + chalk.bold.underline(content) + padding
    }
    return padding + content + padding
  },
  
  // Horizontal rule
  hr: (): string => {
    return chalk.gray("\n" + "─".repeat(process.stdout.columns || 80) + "\n")
  },
  
  // Line breaks
  br: (): string => "\n",
} as any) // Use as any to bypass strict type checking for the renderer

// Configure marked to use terminal renderer
marked.setOptions({
  renderer: terminalRenderer as any,
})

/**
 * Render markdown text to terminal-formatted string
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== "string") {
    return ""
  }
  
  try {
    return marked.parse(markdown) as string
  } catch (err) {
    // Fallback to plain text if parsing fails
    return markdown
  }
}

/**
 * Render and print markdown to stdout
 */
export function printMarkdown(markdown: string): void {
  const rendered = renderMarkdown(markdown)
  console.log(rendered)
}

/**
 * Render markdown in a box with title
 */
export function renderMarkdownBox(markdown: string, title?: string): string {
  const boxWidth = Math.min(80, process.stdout.columns || 80)
  const rendered = renderMarkdown(markdown)
  const lines = rendered.split("\n")
  
  const topBorder = chalk.gray("┌" + "─".repeat(boxWidth - 2) + "┐")
  const bottomBorder = chalk.gray("└" + "─".repeat(boxWidth - 2) + "┘")
  
  let result = topBorder + "\n"
  
  if (title) {
    const titleStr = ` ${chalk.bold.white(title)} `
    const padding = boxWidth - 2 - titleStr.length
    result += chalk.gray("│") + titleStr + " ".repeat(Math.max(0, padding)) + chalk.gray("│") + "\n"
    result += chalk.gray("├" + "─".repeat(boxWidth - 2) + "┤") + "\n"
  }
  
  for (const line of lines) {
    const truncated = line.slice(0, boxWidth - 4)
    const padding = boxWidth - 4 - truncated.length
    result += chalk.gray("│ ") + truncated + " ".repeat(Math.max(0, padding)) + chalk.gray(" │") + "\n"
  }
  
  result += bottomBorder
  return result
}

/**
 * Render a plan as markdown
 */
export function renderPlanMarkdown(plan: {
  goal: string
  summary: string
  status: string
  steps: Array<{
    id: string
    title: string
    description: string
    status: string
    type: string
    complexity?: number
  }>
}): string {
  const lines: string[] = [
    `# ${plan.goal}`,
    "",
    `**Status:** ${plan.status}`,
    "",
    "## Summary",
    plan.summary,
    "",
    "## Steps",
    "",
  ]
  
  for (const step of plan.steps) {
    const statusEmoji = {
      pending: "⬜",
      selected: "☑️",
      in_progress: "🔄",
      completed: "✅",
      failed: "❌",
      skipped: "⏭️",
    }[step.status] || "⬜"
    
    lines.push(`${statusEmoji} **${step.id}:** ${step.title}`)
    lines.push(`   Type: \`${step.type}\` | Complexity: ${"⭐".repeat(step.complexity || 3)}`)
    lines.push(`   ${step.description}`)
    lines.push("")
  }
  
  return lines.join("\n")
}

/**
 * Render search results as markdown
 */
export function renderSearchResults(results: Array<{
  title: string
  url: string
  snippet: string
}>): string {
  const lines: string[] = ["# Search Results", ""]
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (!r) continue
    lines.push(`${i + 1}. **${r.title}**`)
    lines.push(`   [${r.url}](${r.url})`)
    lines.push(`   ${r.snippet}`)
    lines.push("")
  }
  
  return lines.join("\n")
}

// Export for use in CLI
export { marked, TerminalRenderer }
