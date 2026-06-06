import type { Command } from "commander"

export function registerWithOptions(program: Command) {
  program
    .command("with-options")
    .alias("wo")
    .description("A command with options and a default value")
    .option("-p, --port <port>", "Port number", "8080")
    .option("--host <host>", "Host to bind to")
    .option("-f, --force", "Force the operation", false)
    .action((opts: { port: string; host?: string; force: boolean }) => {
      console.log(`Port: ${opts.port}, Host: ${opts.host ?? "localhost"}, Force: ${opts.force}`)
    })
}
