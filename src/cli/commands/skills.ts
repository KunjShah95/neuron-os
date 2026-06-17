import { Command } from "commander"
import { fetchTopSkills, searchSkills, fetchSkillDetail } from "../../skills/remote"
import { skillRegistry } from "../../skills/registry"
import { theme } from "../theme"
import { createLogger } from "../logger"
import {
  distill,
  loadRecentEpisodes,
  gate,
  checkRetirementEligibility,
  retireSkill,
  publishToHub,
  browseHub,
} from "../../skills/evolution"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

const log = createLogger("cli:skills")

/**
 * Register `aegis skills` commands — marketplace, evolution, and management.
 */
export function registerSkills(program: Command): void {
  const skillsCmd = program
    .command("skills")
    .description("Manage skills and browse the marketplace (also: evolution, publish, hub)")
    .action(async () => {
      await skillRegistry.loadAll()
      const skills = skillRegistry.list()
      console.log(`\n  ${theme.heading("Installed Skills")}`)
      console.log(`  ${theme.muted(`(${skills.length} total)`)}\n`)
      if (skills.length === 0) {
        console.log(`  ${theme.muted("No skills installed.")}`)
        console.log(`  ${theme.muted("Browse the marketplace: aegis skills browse")}\n`)
        return
      }
      for (const skill of skills) {
        const tags = skill.metadata.tags
        const tagStr = tags && tags.length > 0 ? ` ${theme.muted(tags.map((t) => `#${t}`).join(" "))}` : ""
        console.log(`  ${theme.textBright(skill.metadata.name)}${tagStr}`)
        if (skill.metadata.description) console.log(`    ${theme.muted(skill.metadata.description)}`)
        console.log()
      }
    })

  // ── skills search <query> ──────────────────────────────────────────

  skillsCmd
    .command("search")
    .description("Search the skills marketplace")
    .argument("<query>", "Search query")
    .option("-l, --limit <number>", "Max results", "10")
    .action(async (query: string, options: { limit?: string }) => {
      const limit = parseInt(options.limit || "10", 10) || 10
      console.log(`\n  ${theme.heading("Searching skills.sh for:")} ${query}\n`)

      const results = await searchSkills(query, limit)
      if (results.length === 0) {
        console.log(`  ${theme.muted("No results found. Try a different query.")}\n`)
        return
      }

      for (const skill of results) {
        const tagStr = skill.tags?.length > 0 ? ` ${theme.muted(skill.tags.map((t: string) => `#${t}`).join(" "))}` : ""
        const installs = skill.installs ? ` ${theme.muted(`${skill.installs.toLocaleString()} installs`)}` : ""
        console.log(`  ${theme.textBright(skill.name)}${installs}${tagStr}`)
        if (skill.description) {
          console.log(`    ${theme.muted(skill.description)}`)
        }
        console.log("")
      }
    })

  // ── skills browse ──────────────────────────────────────────────────

  skillsCmd
    .command("browse")
    .description("Browse trending skills in the marketplace")
    .option("-l, --limit <number>", "Max results", "20")
    .action(async (options: { limit?: string }) => {
      const limit = parseInt(options.limit || "20", 10) || 20
      console.log(`\n  ${theme.heading("Trending Skills on skills.sh")}\n`)

      const results = await fetchTopSkills(limit)
      if (results.length === 0) {
        console.log(`  ${theme.muted("Marketplace unavailable. Set SKILLS_API_URL or try again later.")}\n`)
        return
      }

      for (let i = 0; i < results.length; i++) {
        const skill = results[i] as (typeof results)[0]
        const tagStr = skill.tags?.length > 0 ? ` ${theme.muted(skill.tags.map((t: string) => `#${t}`).join(" "))}` : ""
        const installs = skill.installs ? ` ${theme.muted(`${skill.installs.toLocaleString()} installs`)}` : ""
        console.log(`  ${(i + 1).toString().padStart(2, " ")}. ${theme.textBright(skill.name)}${installs}${tagStr}`)
        if (skill.description) {
          console.log(`     ${theme.muted(skill.description)}`)
        }
        console.log("")
      }
      console.log(`  ${theme.muted("Install with: aegis skills install <name>")}\n`)
    })

  // ── skills install <name> ──────────────────────────────────────────

  skillsCmd
    .command("install")
    .description("Install a skill from the marketplace")
    .argument("<name>", "Skill name to install")
    .option("-f, --force", "Overwrite existing skill", false)
    .action(async (name: string, options: { force?: boolean }) => {
      console.log(`\n  ${theme.heading(`Installing skill: ${name}`)}\n`)

      // Check if already installed
      const existing = skillRegistry.get(name)
      if (existing && !options.force) {
        console.log(`  ${theme.muted(`Skill "${name}" is already installed. Use --force to overwrite.`)}\n`)
        return
      }

      // Look up skill detail
      const detail = await fetchSkillDetail(name)
      if (!detail) {
        console.log(`  ${theme.muted(`Skill "${name}" not found in marketplace.`)}\n`)
        console.log(`  ${theme.muted(`Try 'aegis skills search ${name}' to find it.`)}\n`)
        return
      }

      const installUrl = `https://skills.sh/skills/${detail.id || detail.name}`
      console.log(`  ${theme.textBright("Found:")} ${detail.name}`)
      console.log(`  ${theme.textBright("By:")} ${detail.owner}`)
      console.log(`  ${theme.textBright("Description:")} ${detail.description}`)
      console.log("")
      console.log(`  ${theme.muted("To install, visit:")}`)
      console.log(`  ${theme.accent(installUrl)}`)
      console.log("")
      console.log(`  ${theme.muted("Follow the instructions on the page to copy the SKILL.md into:")}`)
      console.log(`  ${theme.muted(`  skills/${detail.name}/SKILL.md`)}`)
      console.log("")

      log.info("Skill install requested", { name, detail: detail.id })
    })

  // ── skills list ────────────────────────────────────────────────────

  skillsCmd
    .command("list")
    .description("List installed skills")
    .action(async () => {
      await skillRegistry.loadAll()
      const skills = skillRegistry.list()

      console.log(`\n  ${theme.heading("Installed Skills")}`)
      console.log(`  ${theme.muted(`(${skills.length} total)`)}\n`)

      if (skills.length === 0) {
        console.log(`  ${theme.muted("No skills installed.")}`)
        console.log(`  ${theme.muted("Browse the marketplace: aegis skills browse")}\n`)
        return
      }

      for (const skill of skills) {
        const tags = skill.metadata.tags
        const tagStr = tags && tags.length > 0 ? ` ${theme.muted(tags.map((t) => `#${t}`).join(" "))}` : ""
        console.log(`  ${theme.textBright(skill.metadata.name)}${tagStr}`)
        if (skill.metadata.description) {
          console.log(`    ${theme.muted(skill.metadata.description)}`)
        }
        console.log("")
      }
    })

  // ── skills evolution status ────────────────────────────────────────

  skillsCmd
    .command("evolution")
    .description("Self-evolving skills loop — distiller, quality gate, and retirement")
    .argument("[subcommand]", "status | run | inspect <candidate> | approve <id> | reject <id>")
    .option("-s, --since <hours>", "Look back N hours for episodes", "24")
    .option("--reason <text>", "Reason for rejection")
    .action(async (subcommand: string | undefined, options: { since?: string; reason?: string; args?: string[] }) => {
      if (!subcommand || subcommand === "status") {
        console.log(`\n  ${theme.heading("Evolution Status")}\n`)
        console.log(`  ${theme.muted("Run 'aegis skills evolution run' to trigger the distiller")}`)
        console.log(`  ${theme.muted("Distiller schedule: nightly (3am default)")}\n`)
        return
      }

      if (subcommand === "run") {
        console.log(`\n  ${theme.heading("Running Evolution Distiller")}\n`)
        const sinceMs = Date.now() - parseInt(options.since || "24", 10) * 60 * 60 * 1000
        const episodes = loadRecentEpisodes(sinceMs)
        console.log(
          `  ${theme.muted(`Loaded ${episodes.length} episodes since ${new Date(sinceMs).toISOString().slice(0, 10)}`)}`,
        )

        const result = await distill(episodes)
        console.log(
          `  ${theme.muted(`Found ${result.clustersFound} clusters, ${result.candidates.length} candidates`)}`,
        )
        console.log(`  ${theme.muted(`Duration: ${result.durationMs}ms`)}\n`)

        if (result.candidates.length === 0) {
          console.log(`  ${theme.textBright("No candidates generated. Try adjusting the --since window.")}\n`)
          return
        }

        // Run quality gate on each candidate
        for (const candidate of result.candidates) {
          console.log(
            `  ${theme.textBright("Candidate:")} ${candidate.name} (${candidate.evidence.length} evidence episodes)`,
          )
          const decision = await gate(candidate)
          if (decision.passed) {
            console.log(
              `  ${theme.accent("✅ Approved")} — judge: ${decision.judge.verdict}, regression: ${Math.round(decision.regression.passRate * 100)}%`,
            )
          } else {
            console.log(
              `  ${theme.dim("❌ Rejected")} — judge: ${decision.judge.verdict}, regression: ${Math.round(decision.regression.passRate * 100)}%`,
            )
          }
          console.log("")
        }
        return
      }

      console.log(`  ${theme.muted("Unknown subcommand. Use: status | run")}\n`)
    })

  // ── skills hub browse ─────────────────────────────────────────────

  const hubCmd = skillsCmd.command("hub").description("Browse and publish skills on agentskills.io")

  hubCmd
    .command("browse")
    .description("Browse trending skills on agentskills.io")
    .option("-l, --limit <number>", "Max results", "10")
    .action(async (options: { limit?: string }) => {
      const limit = parseInt(options.limit || "10", 10) || 10
      console.log(`\n  ${theme.heading("agentskills.io — Trending Skills")}\n`)
      const skills = await browseHub(limit)
      if (skills.length === 0) {
        console.log(`  ${theme.muted("No skills found or hub unavailable.")}\n`)
        return
      }
      for (const skill of skills) {
        console.log(`  ${theme.textBright(skill.name)} v${skill.version || "?"} — ${skill.description.slice(0, 60)}`)
        console.log(`    ${theme.muted(`${skill.installs} installs · score: ${skill.quality_score}`)}\n`)
      }
    })

  hubCmd
    .command("publish <name>")
    .description("Publish a skill to agentskills.io")
    .option("--version <version>", "Version for publish")
    .action(async (name: string, options: { version?: string }) => {
      console.log(`\n  ${theme.heading(`Publishing "${name}" to agentskills.io`)}`)
      await skillRegistry.loadAll()
      const skill = skillRegistry.get(name)
      if (!skill) {
        console.log(`  ${theme.dim(`Skill "${name}" not found locally`)}\n`)
        return
      }
      const result = await publishToHub({
        name,
        description: skill.metadata.description,
        tags: skill.metadata.tags,
        version: options.version || skill.metadata.version || "1.0.0",
        author: skill.metadata.author,
        provenance: {
          quality_score: 1.0,
          evidence_count: 0,
          judge_verdict: "pass",
        },
      })
      if (result.success) {
        console.log(`  ${theme.accent(`✅ Published: ${result.url}`)}\n`)
      } else {
        console.log(`  ${theme.dim(`❌ Failed: ${result.error}`)}\n`)
      }
    })

  // ── skills list-staged ────────────────────────────────────────────

  skillsCmd
    .command("list-staged")
    .description("List skill candidates awaiting approval and auto-approved skills")
    .action(async () => {
      const { skillReviewStore } = await import("../../improve/skill-review")
      const staged = skillReviewStore.listStaged()
      const autoApproved = skillReviewStore.listAutoApproved()

      console.log(`\n  ${theme.heading("Skill Candidates Queue")}`)

      // ── Staged (pending review) ─────────────────────────────────────
      console.log(`\n  ${theme.textBright("📋 Pending Review")}`)
      console.log(`  ${theme.muted(`(${staged.length} candidates awaiting approval)`)}\n`)
      if (staged.length === 0) {
        console.log(`  ${theme.muted("  No candidates staged for review.")}\n`)
      } else {
        for (const c of staged) {
          console.log(`  ${theme.textBright(c.id)}  ${theme.accent(c.name)}`)
          console.log(`    ${theme.muted(`confidence: ${(c.confidence * 100).toFixed(0)}%  success-rate: ${(c.successRate * 100).toFixed(0)}%  status: ${c.status}`)}`)
          if (c.description) console.log(`    ${theme.muted(c.description)}`)
          console.log()
        }
        console.log(`  ${theme.muted("Approve with: aegis skills approve <id>")}\n`)
      }

      // ── Auto-approved ────────────────────────────────────────────────
      console.log(`  ${theme.textBright("✅ Auto-Approved")}`)
      console.log(`  ${theme.muted(`(${autoApproved.length} skills written directly to src/skills/)`)}\n`)
      if (autoApproved.length === 0) {
        console.log(`  ${theme.muted("  No auto-approved skills yet.")}\n`)
      } else {
        for (const c of autoApproved) {
          console.log(`  ${theme.textBright(c.id)}  ${theme.accent(c.name)}`)
          console.log(`    ${theme.muted(`confidence: ${(c.confidence * 100).toFixed(0)}%  success-rate: ${(c.successRate * 100).toFixed(0)}%  invocations: ${c.invocationCount}`)}`)
          if (c.description) console.log(`    ${theme.muted(c.description)}`)
          console.log()
        }
      }
    })

  // ── skills approve <id> ────────────────────────────────────────────

  skillsCmd
    .command("approve")
    .description("Approve a staged skill candidate and write it to src/skills/")
    .argument("<id>", "Candidate ID from list-staged")
    .action(async (id: string) => {
      const { skillExtractor } = await import("../../improve/skill-extractor")
      console.log(`\n  ${theme.heading(`Approving skill candidate: ${id}`)}\n`)
      const result = await skillExtractor.approveFromStaging(id)
      if (result.success) {
        console.log(`  ${theme.accent(`Skill written to: ${result.skillPath}`)}`)
        console.log(`  ${theme.muted("Candidate removed from staging.")}\n`)
      } else {
        console.log(`  ${theme.dim(`Failed: ${result.error}`)}\n`)
      }
    })

  // ── skills retire ──────────────────────────────────────────────────

  skillsCmd
    .command("retire")
    .description("Retire underperforming skills (move to archive)")
    .option("-n, --dry-run", "Show what would be retired without doing it")
    .option("-d, --days <number>", "Failure window in days", "7")
    .action(async (options: { dryRun?: boolean; days?: string }) => {
      const days = parseInt(options.days || "7", 10)
      console.log(`\n  ${theme.heading("Retirement Check")}\n`)
      if (options.dryRun) {
        console.log(`  ${theme.muted("(dry run — no skills will be moved)")}\n`)
      }

      const skillsBase = join(process.cwd(), "skills")

      if (!existsSync(skillsBase)) {
        console.log(`  ${theme.muted("No skills directory found.")}\n`)
        return
      }

      const entries = readdirSync(skillsBase, { withFileTypes: true })
      const retired: string[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const check = checkRetirementEligibility(entry.name, days)
        if (!check.shouldRetire) continue
        console.log(`  ${theme.dim(`⚠ ${entry.name}: ${check.reason}`)}`)
        if (!options.dryRun) {
          const ok = await retireSkill(entry.name, check.reason)
          if (ok) retired.push(entry.name)
        }
      }

      if (retired.length > 0) {
        console.log(`\n  ${theme.accent(`✅ Retired ${retired.length} skills`)}`)
      } else if (!options.dryRun) {
        console.log(`  ${theme.muted("No skills eligible for retirement.")}\n`)
      }
      console.log("")
    })
}
