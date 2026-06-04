import type { Command } from "commander"
import { theme } from "../theme"
import { createLogger } from "../logger"

const log = createLogger("cli:openapi")

export function registerOpenApi(program: Command) {
  const openapi = program
    .command("openapi")
    .description("Generate or serve the OpenAPI 3.0 specification")

  openapi
    .command("generate")
    .description("Generate OpenAPI spec as JSON to stdout or file")
    .option("-o, --output <file>", "Write to file instead of stdout")
    .action(async (opts: { output?: string }) => {
      const { buildSpec } = await import("../../../scripts/generate-openapi")
      const spec = buildSpec()
      const json = JSON.stringify(spec, null, 2)

      if (opts.output) {
        const { writeFileSync } = await import("node:fs")
        const { resolve } = await import("node:path")
        writeFileSync(resolve(process.cwd(), opts.output), json, "utf-8")
        console.log(theme.success(`  ✓ OpenAPI spec written to ${opts.output}`))
        log.info("OpenAPI spec generated", { output: opts.output })
      } else {
        console.log(json)
      }
    })

  openapi
    .command("serve")
    .description("Serve OpenAPI spec as JSON via HTTP")
    .option("-p, --port <port>", "Port to listen on", "8081")
    .option("--host <host>", "Host to bind to", "localhost")
    .action(async (opts: { port?: string; host?: string }) => {
      const port = parseInt(opts.port ?? "8081", 10)
      const host = opts.host ?? "localhost"

      const { buildSpec } = await import("../../../scripts/generate-openapi")
      const spec = buildSpec()

      const server = Bun.serve({
        port,
        hostname: host,
        fetch(request: Request) {
          const url = new URL(request.url)

          // GET / → Swagger UI redirect
          if (url.pathname === "/") {
            return new Response(
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Neuron OS API — OpenAPI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })
  </script>
</body>
</html>`,
              { headers: { "Content-Type": "text/html; charset=utf-8" } },
            )
          }

          // GET /openapi.json → the spec
          if (url.pathname === "/openapi.json") {
            return new Response(JSON.stringify(spec), {
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            })
          }

          return new Response("Not found", { status: 404 })
        },
      })

      console.log(theme.heading("  OpenAPI Spec Server"))
      console.log()
      console.log(`  Swagger UI: ${theme.info(`http://${host}:${port}/`)}`)
      console.log(`  Raw spec:   ${theme.info(`http://${host}:${port}/openapi.json`)}`)
      console.log()

      log.info("OpenAPI spec server started", { port, host })

      process.on("SIGINT", () => {
        server.stop()
        process.exit(0)
      })

      await new Promise(() => {})
    })

  // Default action
  openapi.action(async () => {
    const { buildSpec } = await import("../../../scripts/generate-openapi")
    const spec = buildSpec()
    const endpointCount = Object.keys(spec.paths).length
    const schemaCount = Object.keys(spec.components.schemas).length

    console.log(theme.heading("  OpenAPI 3.0 Specification"))
    console.log()
    console.log(`  ${theme.bold("Title:")}       ${theme.muted(spec.info.title)}`)
    console.log(`  ${theme.bold("Version:")}     ${theme.muted(spec.info.version)}`)
    console.log(`  ${theme.bold("Endpoints:")}   ${theme.muted(String(endpointCount))}`)
    console.log(`  ${theme.bold("Schemas:")}     ${theme.muted(String(schemaCount))}`)
    console.log()
    console.log(theme.muted("  Subcommands:"))
    console.log(theme.muted("    openapi generate    Generate spec JSON"))
    console.log(theme.muted("    openapi serve       Serve spec with Swagger UI"))
    console.log()
  })
}
