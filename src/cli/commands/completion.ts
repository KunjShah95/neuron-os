/**
 * completion — Shell completion generation.
 *
 * Generates shell completion scripts for bash, zsh, and fish.
 * Supports the Commander.js auto-completion system.
 *
 * Usage:
 *   aegis completion bash   # Print bash completion script
 *   aegis completion zsh    # Print zsh completion script
 *   aegis completion fish   # Print fish completion script
 */

import type { Command } from "commander"
import { theme } from "../theme"

export function registerCompletion(program: Command) {
  const completion = program
    .command("completion")
    .description("Generate shell completion scripts (bash, zsh, fish)")
    .argument("[shell]", "Target shell: bash, zsh, or fish")

  completion
    .command("bash")
    .description("Generate bash completion script")
    .action(() => printCompletion(program, "bash"))

  completion
    .command("zsh")
    .description("Generate zsh completion script")
    .action(() => printCompletion(program, "zsh"))

  completion
    .command("fish")
    .description("Generate fish completion script")
    .action(() => printCompletion(program, "fish"))

  completion.action((shell?: string) => {
    if (shell && ["bash", "zsh", "fish"].includes(shell)) {
      printCompletion(program, shell as "bash" | "zsh" | "fish")
    } else {
      console.log(theme.heading("  Shell Completion Generator"))
      console.log()
      console.log(`  ${theme.bold("Usage:")} aegis completion <shell>`)
      console.log()
      console.log(`  ${theme.muted("Available shells: bash, zsh, fish")}`)
      console.log()
      console.log(`  ${theme.muted("Example:")}`)
      console.log(`  ${theme.dim("    # For bash")}`)
      console.log(`  ${theme.dim("    aegis completion bash > /etc/bash_completion.d/aegis")}`)
      console.log(`  ${theme.dim("    source /etc/bash_completion.d/aegis")}`)
      console.log()
      console.log(`  ${theme.dim("    # For zsh (oh-my-zsh)")}`)
      console.log(`  ${theme.dim("    aegis completion zsh > ${fpath[1]}/_aegis")}`)
      console.log(`  ${theme.dim("    compinit")}`)
      console.log()
      console.log(`  ${theme.dim("    # For fish")}`)
      console.log(`  ${theme.dim("    aegis completion fish > ~/.config/fish/completions/aegis.fish")}`)
      console.log()
    }
  })
}

function printCompletion(program: Command, shell: "bash" | "zsh" | "fish") {
  const commands = program.commands
    .filter((c) => c.name() !== "help" && c.name() !== "completion" && c.name() !== "build")
    .map((c) => ({
      name: c.name(),
      description: c.description(),
      aliases: c.aliases(),
    }))

  switch (shell) {
    case "bash":
      printBashCompletion(commands)
      break
    case "zsh":
      printZshCompletion(commands)
      break
    case "fish":
      printFishCompletion(commands)
      break
  }
}

function printBashCompletion(commands: Array<{ name: string; description: string; aliases: string[] }>) {
  const withAliases = commands.flatMap((c) => [c.name, ...c.aliases])

  console.log(`# Aegis CLI bash completion
_aegis_completions() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  local prev=\${COMP_WORDS[COMP_CWORD-1]}

  case \${COMP_CWORD} in
    1)
      COMPREPLY=($(compgen -W "${withAliases.join(" ")}" -- "\${cur}"))
      ;;
    2)
      case \${prev} in
        ${commands
          .filter((c) => c.aliases.length > 0)
          .map((c) => `${c.name}|${c.aliases.join("|")}`)
          .join("|")})
          COMPREPLY=($(compgen -W "--help" -- "\${cur}"))
          ;;
        *)
          COMPREPLY=($(compgen -W "--help --json --verbose" -- "\${cur}"))
          ;;
      esac
      ;;
  esac
}
complete -F _aegis_completions aegis
`)
}

function printZshCompletion(commands: Array<{ name: string; description: string; aliases: string[] }>) {
  console.log(`#compdef aegis
typeset -A opt_args

_arguments \\
  "(-V --version)"{-V,--version}"[output the version number]" \\
  "(-h --help)"{-h,--help}"[display help for command]" \\
  "*::command:->cmd" \\
  && return 0

case $state in
  cmd)
    local -a subcommands
    subcommands=(
${commands.map((c) => `      "${c.name}:${c.description}"`).join("\n")}
    )
    _describe -t commands "aegis subcommand" subcommands
    ;;
esac
`)
}

function printFishCompletion(commands: Array<{ name: string; description: string; aliases: string[] }>) {
  const lines = commands.map((c) => {
    const aliases = c.aliases.map((a) => `-s ${a}`).join(" ")
    return `complete -c aegis -n '__fish_use_subcommand' -a '${c.name}' -d '${c.description}' ${aliases}`
  })

  console.log(`# Aegis CLI fish completion
${lines.join("\n")}

# Global options
complete -c aegis -s h -l help -d 'Display help'
complete -c aegis -s V -l version -d 'Show version'
`)
}
