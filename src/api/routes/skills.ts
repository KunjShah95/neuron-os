import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "../../cli/logger"
import { jsonResponse } from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"
import { SaveSkillSchema } from "./schemas"

const log = createLogger("api")

interface SkillEntry {
  name: string
  description: string
  tags: string[]
  type: string
  widgetJson: Record<string, unknown>
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export async function handleSkillRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  const { method, pathname, body } = req

  if (pathname === "/api/v1/skills" && method === "POST") {
    const skillResult = SaveSkillSchema.safeParse(body)
    if (!skillResult.success) {
      return jsonResponse(400, { error: skillResult.error.issues.map((i) => i.message).join("; ") }, config, req)
    }

    const payload = skillResult.data
    try {
      const skillsDir = join(process.cwd(), "skills", payload.name)
      if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })

      const tagsYaml = payload.tags.length > 0 ? `tags: [${payload.tags.join(", ")}]` : ""
      const widgetTitle = asString(payload.widgetJson["title"], payload.name)
      const skillContent = [
        "---",
        `name: ${payload.name}`,
        `description: ${payload.description}`,
        tagsYaml,
        "---",
        "",
        `# A2UI Widget: ${widgetTitle}`,
        "",
        `Emits an A2UI **${payload.type}** widget via WebSocket.`,
        "",
        "## Widget JSON",
        "",
        "```json",
        JSON.stringify(payload.widgetJson, null, 2),
        "```",
        "",
        "## Usage",
        "",
        "Call `emitWidget` with the JSON above to render this widget in the A2UI dashboard.",
        "",
      ]
        .filter(Boolean)
        .join("\n")

      writeFileSync(join(skillsDir, "SKILL.md"), skillContent, "utf-8")
      writeFileSync(
        join(skillsDir, "widget.json"),
        JSON.stringify(
          {
            name: payload.name,
            description: payload.description,
            tags: payload.tags,
            type: payload.type,
            widgetJson: payload.widgetJson,
          },
          null,
          2,
        ),
        "utf-8",
      )
      log.info("Skill saved from A2UI playground", { name: payload.name, type: payload.type })
      return jsonResponse(201, { status: "saved", path: join(skillsDir, "SKILL.md") }, config, req)
    } catch (err: unknown) {
      const skillErrMsg = err instanceof Error ? err.message : String(err)
      log.error("Failed to save skill", { error: skillErrMsg })
      return jsonResponse(500, { error: skillErrMsg }, config, req)
    }
  }

  if (pathname === "/api/v1/skills" && method === "GET") {
    try {
      const skillsBase = join(process.cwd(), "skills")
      if (!existsSync(skillsBase)) {
        return jsonResponse(200, { skills: [] }, config, req)
      }

      const entries = readdirSync(skillsBase, { withFileTypes: true })
      const skills: SkillEntry[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dirPath = join(skillsBase, entry.name)

        const widgetJsonPath = join(dirPath, "widget.json")
        if (existsSync(widgetJsonPath)) {
          try {
            const data: unknown = JSON.parse(readFileSync(widgetJsonPath, "utf-8"))
            const record = asRecord(data)
            skills.push({
              name: asString(record["name"], entry.name),
              description: asString(record["description"], ""),
              tags: asStringArray(record["tags"]),
              type: asString(record["type"], "unknown"),
              widgetJson: asRecord(record["widgetJson"]),
            })
          } catch {
            log.warn("Failed to parse widget.json for skill", { name: entry.name })
          }
          continue
        }

        const skillPath = join(dirPath, "SKILL.md")
        if (!existsSync(skillPath)) continue
        try {
          const content = readFileSync(skillPath, "utf-8")
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
          const widgetJson = jsonMatch && jsonMatch[1] ? asRecord(JSON.parse(jsonMatch[1])) : {}
          skills.push({
            name: entry.name,
            description: "",
            tags: [],
            type: asString(widgetJson["type"], "unknown"),
            widgetJson,
          })
        } catch {
          log.warn("Failed to parse SKILL.md for skill", { name: entry.name })
        }
      }

      return jsonResponse(200, { skills }, config, req)
    } catch (err: unknown) {
      const listErrMsg = err instanceof Error ? err.message : String(err)
      log.error("Failed to list skills", { error: listErrMsg })
      return jsonResponse(500, { error: listErrMsg }, config, req)
    }
  }

  return null
}
