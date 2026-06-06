import type { Command } from "commander"

export function registerSimple(program: Command) {
  program
    .command("simple")
    .description("A simple command with no options")
    .action(() => {
      console.log("simple command executed")
    })
}
