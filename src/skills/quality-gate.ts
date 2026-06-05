import { createLogger } from "../cli/logger"

import { spawn } from "bun"
import { resolve } from "node:path"
import { writeFileSync, unlinkSync } from "node:fs"

const log = createLogger("quality-gate")

export interface SkillProposal {
  name: string
  description: string
  content: string // Markdown or code content of the skill
  testCommand?: string // Command to run to verify the skill works
}

export class SkillQualityGate {
  constructor() {
  }

  /**
   * Evaluates a skill proposal by:
   * 1. Writing it to a temporary file
   * 2. Running the associated testCommand (if provided) in a sandbox/subprocess
   * 3. Verifying the exit code
   * 4. Cleaning up
   */
  public async evaluateSkill(proposal: SkillProposal, cwd: string = process.cwd()): Promise<boolean> {
    log.info(`Evaluating proposed skill: ${proposal.name}`)
    
    // Write skill to a temporary location for testing
    const tempSkillPath = resolve(cwd, `.aegis_temp_skill_${Date.now()}.md`)
    try {
      writeFileSync(tempSkillPath, proposal.content)

      // If there's a specific test command for this skill, run it
      if (proposal.testCommand) {
        log.info(`Running skill test command: ${proposal.testCommand}`)
        
        // We use Bun's spawn for a quick local test
        // In a strictly sandboxed environment, this would route to a containerized test runner
        const child = spawn({
          cmd: proposal.testCommand.split(" "),
          cwd,
          env: { ...process.env, AEGIS_TEST_SKILL_PATH: tempSkillPath },
          stdout: "pipe",
          stderr: "pipe"
        })

        const exitCode = await child.exited
        if (exitCode !== 0) {
          log.error(`Skill ${proposal.name} failed quality gate (exit code ${exitCode}). Rejecting.`)
          return false
        }
      }

      // If no test command or test passed, it's conditionally approved
      log.info(`Skill ${proposal.name} passed quality gate.`)
      return true
    } catch (err) {
      log.error(`Error during skill evaluation: ${err}`)
      return false
    } finally {
      try {
        unlinkSync(tempSkillPath)
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

export const qualityGate = new SkillQualityGate()
