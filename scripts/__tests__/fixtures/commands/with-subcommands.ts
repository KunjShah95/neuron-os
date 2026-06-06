import type { Command } from "commander"

export function registerParent(program: Command) {
  const parent = program
    .command("parent")
    .alias("p")
    .description("A parent command with subcommands")

  parent
    .command("child-one")
    .description("First child")
    .action(() => {
      console.log("child-one")
    })

  parent
    .command("child-two <arg>")
    .description("Second child with argument")
    .option("--flag <value>", "A flag")
    .action((arg: string, opts: { flag?: string }) => {
      console.log(`child-two ${arg}, flag=${opts.flag}`)
    })

  parent
    .command("child-three")
    .alias("c3")
    .description("Third child")
    .action(() => {
      console.log("child-three")
    })
}
