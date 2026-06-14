import type { Command } from "commander"
import { mkdir } from "node:fs/promises"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { theme } from "../theme"

function getRegistryPath(): string {
  return join(homedir(), ".aegis", "marketplace", "registry.db")
}

function getAgentsDir(): string {
  return join(homedir(), ".aegis", "agents")
}

export function registerMarketplace(program: Command): void {
  const mp = program
    .command("marketplace")
    .alias("mp")
    .description("Agent Marketplace — publish, install, search, and rate agent configs")

  // ── marketplace search <query> ─────────────────────────────────────
  mp.command("search <query>")
    .description("Search the marketplace for agents")
    .option("-t, --type <type>", "Filter by agent type (coder, reviewer, planner, etc.)")
    .option("-p, --provider <provider>", "Filter by provider")
    .option("-r, --min-rating <rating>", "Minimum average rating")
    .option("--sort <field>", "Sort by: rating, installs, recent, name")
    .option("--page <n>", "Page number (0-indexed)", "0")
    .option("--json", "Output as JSON")
    .action(
      async (
        query: string,
        opts: {
          type?: string
          provider?: string
          minRating?: string
          sort?: string
          page?: string
          json?: boolean
        },
      ) => {
        try {
          const { MarketplaceRegistry } = await import("../../marketplace/registry")
          const { MarketplaceSearch } = await import("../../marketplace/search")

          const registry = new MarketplaceRegistry(getRegistryPath())
          try {
            const search = new MarketplaceSearch(registry)
            const result = search.search(query, {
              type: opts.type as NonNullable<Parameters<typeof search.search>[1]>["type"],
              provider: opts.provider,
              minRating: opts.minRating ? parseFloat(opts.minRating) : undefined,
              sort: opts.sort as NonNullable<Parameters<typeof search.search>[1]>["sort"],
              page: parseInt(opts.page ?? "0", 10),
            })

            if (opts.json) {
              console.log(JSON.stringify(result, null, 2))
              return
            }

            if (result.entries.length === 0) {
              console.log(theme.info('No agents matching "' + query + '"'))
              return
            }

            console.log(
              theme.heading(
                'Results (' + result.total + " total, page " + (result.page + 1) + "/" + result.totalPages + "):",
              ),
            )
            for (const e of result.entries) {
              const stars = "★".repeat(Math.round(e.rating.average)) + "☆".repeat(5 - Math.round(e.rating.average))
              console.log(
                theme.info(
                  "  " +
                    e.config.name +
                    "@" +
                    e.version +
                    "  " +
                    stars +
                    " (" +
                    e.rating.count +
                    ")  " +
                    e.installCount +
                    " installs",
                ),
              )
              console.log(theme.muted("    " + e.config.description.slice(0, 80)))
            }
          } finally {
            registry.close()
          }
        } catch (err) {
          console.log(theme.error("✖ Search failed: " + String(err)))
          process.exit(1)
        }
      },
    )

  // ── marketplace install <name> ─────────────────────────────────────
  mp.command("install <name>")
    .description("Install an agent config from the marketplace")
    .option("-v, --version <version>", "Specific version to install")
    .action(async (name: string, opts: { version?: string }) => {
      try {
        const { MarketplaceRegistry } = await import("../../marketplace/registry")

        const registry = new MarketplaceRegistry(getRegistryPath())
        try {
          const entry = registry.get(name, opts.version)
          if (!entry) {
            console.log(theme.error("✖ Agent '" + name + "' not found in marketplace"))
            process.exit(1)
          }

          // Copy agent config to local agents directory
          const agentsDir = getAgentsDir()
          const agentDir = join(agentsDir, entry.config.name)
          await mkdir(agentDir, { recursive: true })

          // Write agent.yaml
          const yamlContent = {
            name: entry.config.name,
            type: entry.config.type,
            description: entry.config.description,
            tools: entry.config.tools,
            prompt_template: entry.config.prompt_template,
            budget_usd: entry.config.budget_usd,
            sandbox: entry.config.sandbox,
            provider: entry.config.provider,
            tags: entry.config.tags,
          }
          const { stringify } = await import("yaml")
          const { writeFile } = await import("node:fs/promises")
          await writeFile(join(agentDir, "agent.yaml"), stringify(yamlContent, { lineWidth: 0 }))

          registry.incrementInstalls(entry.config.name, entry.version)
          registry.markInstalled(entry.config.name, entry.version)

          console.log(
            theme.success(
              "✓ Installed " + entry.config.name + "@" + entry.version,
            ),
          )
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error("✖ Install failed: " + String(err)))
        process.exit(1)
      }
    })

  // ── marketplace info <name> ────────────────────────────────────────
  mp.command("info <name>")
    .description("Show detailed info about an agent")
    .option("-v, --version <version>", "Specific version")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { version?: string; json?: boolean }) => {
      try {
        const { MarketplaceRegistry } = await import("../../marketplace/registry")

        const registry = new MarketplaceRegistry(getRegistryPath())
        try {
          const entry = registry.get(name, opts.version)
          if (!entry) {
            console.log(theme.error("✖ Agent '" + name + "' not found"))
            process.exit(1)
          }

          if (opts.json) {
            console.log(JSON.stringify(entry, null, 2))
            return
          }

          const stars = "★".repeat(Math.round(entry.rating.average)) + "☆".repeat(5 - Math.round(entry.rating.average))

          console.log()
          console.log(theme.heading(entry.config.name + "@" + entry.version))
          console.log(theme.muted("─".repeat(50)))
          console.log(theme.info("  Description:  ") + entry.config.description)
          console.log(theme.info("  Type:         ") + entry.config.type)
          console.log(theme.info("  Provider:     ") + entry.config.provider)
          console.log(theme.info("  Author:       ") + entry.author)
          console.log(theme.info("  Rating:       ") + stars + " " + entry.rating.average.toFixed(1) + " (" + entry.rating.count + " ratings)")
          console.log(theme.info("  Installs:     ") + String(entry.installCount))
          console.log(theme.info("  Budget:       ") + "$" + entry.config.budget_usd.toFixed(2))
          console.log(theme.info("  Sandbox:      ") + entry.config.sandbox)
          console.log(theme.info("  Tags:         ") + entry.config.tags.join(", "))
          console.log(theme.info("  Published:    ") + entry.publishedAt.slice(0, 10))
          if (entry.signature) {
            console.log(theme.info("  Signed:       ") + "✓ Ed25519")
          }
          console.log()
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error("✖ Info failed: " + String(err)))
        process.exit(1)
      }
    })

  // ── marketplace rate <name> <stars> ────────────────────────────────
  mp.command("rate <name> <stars>")
    .description("Rate an agent (1-5 stars)")
    .action(async (name: string, starsStr: string) => {
      try {
        const stars = parseInt(starsStr, 10)
        if (isNaN(stars) || stars < 1 || stars > 5) {
          console.log(theme.error("✖ Stars must be an integer between 1 and 5"))
          process.exit(1)
        }

        const { MarketplaceRegistry } = await import("../../marketplace/registry")

        const registry = new MarketplaceRegistry(getRegistryPath())
        try {
          const entry = registry.get(name)
          if (!entry) {
            console.log(theme.error("✖ Agent '" + name + "' not found"))
            process.exit(1)
          }

          registry.rate(entry.config.name, entry.version, stars)
          console.log(theme.success("✓ Rated " + name + " " + stars + "/5 stars"))
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error("✖ Rate failed: " + String(err)))
        process.exit(1)
      }
    })

  // ── marketplace publish <dir> ──────────────────────────────────────
  mp.command("publish <dir>")
    .description("Publish an agent config from a directory containing agent.yaml")
    .option("-k, --key <path>", "Path to private key file")
    .action(async (dir: string) => {
      try {
        const { publishAgent } = await import("../../marketplace/publish")
        const { MarketplaceRegistry } = await import("../../marketplace/registry")

        const agentDir = resolve(dir)
        if (!existsSync(join(agentDir, "agent.yaml"))) {
          console.log(theme.error("✖ agent.yaml not found in " + agentDir))
          process.exit(1)
        }

        const registry = new MarketplaceRegistry(getRegistryPath())
        try {
          const result = await publishAgent(agentDir, registry)

          if (!result.success) {
            console.log(theme.error("✖ Publish failed:"))
            for (const e of result.errors ?? []) {
              console.log(theme.error("  " + e))
            }
            process.exit(1)
          }

          console.log(theme.success("✓ Published " + result.name + "@" + result.version))
          if (result.signed) {
            console.log(theme.info("  Signature: Ed25519 verified"))
          }
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error("✖ Publish failed: " + String(err)))
        process.exit(1)
      }
    })

  // ── marketplace list ───────────────────────────────────────────────
  mp.command("list")
    .description("List locally installed agents")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const { MarketplaceRegistry } = await import("../../marketplace/registry")

        const registry = new MarketplaceRegistry(getRegistryPath())
        try {
          const installed = registry.getInstalled()

          if (opts.json) {
            console.log(JSON.stringify(installed, null, 2))
            return
          }

          if (installed.length === 0) {
            console.log(theme.info("No agents installed"))
            console.log(theme.muted('  Use "aegis marketplace install <name>" to install an agent'))
            return
          }

          console.log(theme.heading("Installed Agents (" + installed.length + "):"))
          for (const e of installed) {
            console.log(
              theme.info(
                "  " + e.config.name + "@" + e.version + "  " + e.config.description.slice(0, 60),
              ),
            )
          }
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error("✖ List failed: " + String(err)))
        process.exit(1)
      }
    })

  // ── marketplace update ─────────────────────────────────────────────
  mp.command("update")
    .description("Update all installed agents to latest versions")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const { MarketplaceRegistry } = await import("../../marketplace/registry")

        const registry = new MarketplaceRegistry(getRegistryPath())
        try {
          const installed = registry.getInstalled()
          let updated = 0

          for (const agent of installed) {
            const latest = registry.get(agent.config.name)
            if (latest && latest.version !== agent.version) {
              registry.markInstalled(agent.config.name, latest.version)
              updated++
              if (!opts.json) {
                console.log(
                  theme.success(
                    "  ✓ " + agent.config.name + ": " + agent.version + " → " + latest.version,
                  ),
                )
              }
            }
          }

          if (opts.json) {
            console.log(JSON.stringify({ updated, total: installed.length }))
            return
          }

          if (updated === 0) {
            console.log(theme.info("All agents are up to date"))
          } else {
            console.log(theme.success("✓ Updated " + updated + " agent(s)"))
          }
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error("✖ Update failed: " + String(err)))
        process.exit(1)
      }
    })
}
