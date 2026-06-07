import type { Command } from "commander"
import { loadCiConfig, saveCiConfig } from "../../ci/config"
import { startCiServer } from "../../ci/server"
import { createLogger } from "../logger"

const log = createLogger("ci-cli")

export function registerCi(program: Command): void {
  const ci = program.command("ci").description("Auto-fix failing CI runs")

  ci.command("watch")
    .description("Start the CI fix daemon")
    .option("--port <number>", "Port to listen on")
    .option("--repo <owner/name>", "Repo to watch (adds to config if not present)")
    .option("--budget <usd>", "Cost budget per run", "0.50")
    .action((opts: { port?: string; repo?: string; budget?: string }) => {
      const config = loadCiConfig()

      if (opts.repo) {
        const [owner, name] = opts.repo.split("/")
        if (owner && name && !config.repos.some((r) => r.owner === owner && r.name === name)) {
          config.repos.push({
            owner,
            name,
            auto_merge: false,
            model: "claude-sonnet-4-6",
            budget_usd: parseFloat(opts.budget ?? "0.50"),
            notify: [],
            allowed_paths: [],
            require_human_approval_comment: true,
          })
          saveCiConfig(config)
          log.info(`Added ${opts.repo} to CI config`)
        }
      }

      const port = opts.port ? parseInt(opts.port, 10) : undefined
      console.log(`Starting CI daemon on port ${port ?? config.port ?? 7117}...`)
      startCiServer(port)
    })

  ci.command("status")
    .description("Show CI fix daemon status")
    .action(() => {
      const config = loadCiConfig()
      console.log(`CI config: ${config.repos.length} repo(s) configured`)
      console.log(`Port: ${config.port}`)
      console.log(`HMAC key: ${config.hmac_key ? "set" : "not set"}`)
      console.log()
      for (const repo of config.repos) {
        console.log(`  ${repo.owner}/${repo.name}`)
        console.log(`    auto_merge: ${repo.auto_merge}`)
        console.log(`    budget: $${repo.budget_usd}`)
        console.log(`    model: ${repo.model}`)
        console.log(`    notify: ${repo.notify.length > 0 ? repo.notify.join(", ") : "none"}`)
        console.log(`    allowed_paths: ${repo.allowed_paths.length > 0 ? repo.allowed_paths.join(", ") : "none"}`)
      }
    })

  ci.command("config")
    .description("Interactive CI setup")
    .action(() => {
      console.log("CI config is at ~/.aegis/ci.yaml")
      console.log("Example:")
      console.log(`
repos:
  - owner: myorg
    name: myrepo
    auto_merge: false
    budget_usd: 0.50
    notify: []
    allowed_paths: []
  - owner: myorg
    name: api
    auto_merge: true
    budget_usd: 1.00
    model: claude-sonnet-4-6
    notify: [discord:#ci]
    allowed_paths: ['src/**', 'tests/**']
    require_human_approval_comment: true
`)
    })

  ci.command("repos")
    .description("List configured repos")
    .action(() => {
      const config = loadCiConfig()
      if (config.repos.length === 0) {
        console.log("No repos configured. Use: aegis ci watch --repo owner/name")
        return
      }
      for (const repo of config.repos) {
        console.log(`${repo.owner}/${repo.name} (auto-merge: ${repo.auto_merge}, budget: $${repo.budget_usd})`)
      }
    })

  ci.command("disable")
    .description("Remove a repo from CI config")
    .argument("<repo>", "owner/name")
    .action((repo: string) => {
      const config = loadCiConfig()
      const [owner, name] = repo.split("/")
      if (!owner || !name) {
        console.log("Usage: aegis ci disable owner/name")
        return
      }
      config.repos = config.repos.filter((r) => !(r.owner === owner && r.name === name))
      saveCiConfig(config)
      console.log(`Removed ${repo} from CI config`)
    })
}
