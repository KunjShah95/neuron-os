import { execSync } from "child_process"
import { createLogger } from "../cli/logger"

const log = createLogger("ci-pr-creator")

export interface PrResult {
  url: string
  number: number
  success: boolean
}

export async function createPr(params: {
  repo: string
  branch: string
  title: string
  body: string
}): Promise<PrResult> {
  const { repo, branch, title, body } = params

  log.info(`Creating PR in ${repo} from branch ${branch}`)

  try {
    const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, "\\n")
    const output = execSync(
      `gh pr create --repo "${repo}" --head "${branch}" --title "${title}" --body "${escapedBody}" --label "ci-fix"`,
      { encoding: "utf-8", timeout: 30_000 },
    ).trim()

    // Parse PR URL from output
    const url = output
    const numberMatch = url.match(/\/(\d+)$/)
    const number = numberMatch ? parseInt(numberMatch[1] ?? "0", 10) : 0

    log.info(`PR created: ${url}`)
    return { url, number, success: true }
  } catch (err) {
    log.warn(`PR creation failed: ${err}`)
    return { url: "", number: 0, success: false }
  }
}

export async function createDraftPr(params: {
  repo: string
  branch: string
  title: string
  body: string
}): Promise<PrResult> {
  const { repo, branch, title, body } = params

  try {
    const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, "\\n")
    const output = execSync(
      `gh pr create --repo "${repo}" --head "${branch}" --title "${title}" --body "${escapedBody}" --label "ci-fix" --draft`,
      { encoding: "utf-8", timeout: 30_000 },
    ).trim()

    const url = output
    const numberMatch = url.match(/\/(\d+)$/)
    const number = numberMatch ? parseInt(numberMatch[1] ?? "0", 10) : 0

    log.info(`Draft PR created: ${url}`)
    return { url, number, success: true }
  } catch (err) {
    log.warn(`Draft PR creation failed: ${err}`)
    return { url: "", number: 0, success: false }
  }
}
