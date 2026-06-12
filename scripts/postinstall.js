#!/usr/bin/env node

/**
 * Postinstall script for neuron-aegis
 * 
 * This script runs after npm install and:
 * 1. Copies .env.example to .env if it doesn't exist
 * 2. Prompts user to set up API keys
 * 3. Provides helpful next steps
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

const ANSI_COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
}

function log(message) {
  console.log(message)
}

function logStep(message) {
  log(`\n${ANSI_COLORS.cyan}▶${ANSI_COLORS.reset} ${ANSI_COLORS.bright}${message}${ANSI_COLORS.reset}`)
}

function logSuccess(message) {
  log(`${ANSI_COLORS.green}✓${ANSI_COLORS.reset} ${message}`)
}

function logWarning(message) {
  log(`${ANSI_COLORS.yellow}⚠${ANSI_COLORS.reset} ${message}`)
}

function logInfo(message) {
  log(`${ANSI_COLORS.blue}ℹ${ANSI_COLORS.reset} ${message}`)
}

function main() {
  log("\n" + "═".repeat(60))
  log(`${ANSI_COLORS.bright}${ANSI_COLORS.cyan}🛡️  Aegis Post-Install Setup${ANSI_COLORS.reset}`)
  log("═".repeat(60))

  // Step 1: Ensure .env file exists
  logStep("Setting up environment file")
  const envExamplePath = resolve(ROOT, ".env.example")
  const envPath = resolve(ROOT, ".env")

  if (!existsSync(envExamplePath)) {
    logWarning(".env.example not found - skipping .env creation")
  } else if (existsSync(envPath)) {
    logInfo(".env file already exists - skipping copy")
  } else {
    try {
      copyFileSync(envExamplePath, envPath)
      logSuccess("Created .env file from .env.example")
      logInfo("Edit .env to add your API keys")
    } catch (err) {
      logWarning(`Failed to copy .env.example: ${err.message}`)
    }
  }

  // Step 2: Ensure ~/.aegis directory exists
  logStep("Setting up Aegis home directory")
  const aegisDir = resolve(homedir(), ".aegis")
  if (!existsSync(aegisDir)) {
    try {
      mkdirSync(aegisDir, { recursive: true })
      logSuccess(`Created ${aegisDir}`)
    } catch (err) {
      logWarning(`Failed to create ${aegisDir}: ${err.message}`)
    }
  } else {
    logInfo(`${aegisDir} already exists`)
  }

  // Step 3: Check for API keys
  logStep("Checking API key configuration")
  
  // Try to load .env to check for keys
  let hasApiKey = false
  const envFiles = [envPath, resolve(homedir(), ".aegis", "agent.env")]
  
  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      try {
        const content = readFileSync(envFile, "utf-8")
        const hasAnyKey = [
          "AEGIS_AI_API_KEY",
          "ANTHROPIC_API_KEY",
          "OPENAI_API_KEY",
          "OPENROUTER_API_KEY",
          "DEEPSEEK_API_KEY",
          "GEMINI_API_KEY",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "GROQ_API_KEY",
          "MISTRAL_API_KEY",
          "AZURE_OPENAI_API_KEY",
          "TOGETHERAI_API_KEY",
          "XAI_API_KEY",
          "COHERE_API_KEY",
          "PERPLEXITY_API_KEY",
          "NVIDIA_API_KEY",
          "CUSTOM_API_KEY",
        ].some((k) => content.split("\n").some((line) => {
          if (line.trimStart().startsWith("#")) return false
          const eqIdx = line.indexOf("=")
          if (eqIdx <= 0) return false
          const key = line.slice(0, eqIdx).trim()
          if (key !== k) return false
          const val = line.slice(eqIdx + 1).trim().split("#")[0].trim()
          return val && !val.includes("...")
        }))
        
        if (hasAnyKey) {
          hasApiKey = true
          break
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  if (hasApiKey) {
    logSuccess("API keys detected - you're ready to go!")
  } else {
    logWarning("No API keys configured yet")
    log("\n" + "─".repeat(60))
    log(`${ANSI_COLORS.bright}Quick Start Guide:${ANSI_COLORS.reset}\n`)
    log("1. Run the interactive setup:")
    log(`   ${ANSI_COLORS.cyan}aegis setup-keys${ANSI_COLORS.reset}`)
    log("\n   This will guide you through configuring API keys with validation.")
    log("\n2. Or manually edit .env and add your preferred provider key:")
    log(`   ${ANSI_COLORS.cyan}ANTHROPIC_API_KEY=sk-ant-...${ANSI_COLORS.reset}`)
    log(`   ${ANSI_COLORS.cyan}OPENAI_API_KEY=sk-...${ANSI_COLORS.reset}`)
    log(`   ${ANSI_COLORS.cyan}OPENROUTER_API_KEY=sk-or-v1-...${ANSI_COLORS.reset}`)
    log("\n3. Verify your setup:")
    log(`   ${ANSI_COLORS.cyan}aegis doctor${ANSI_COLORS.reset}`)
    log("\n4. Start using Aegis:")
    log(`   ${ANSI_COLORS.cyan}aegis wakeup${ANSI_COLORS.reset}`)
    log("─".repeat(60))
  }

  // Step 4: Show available commands
  logStep("Essential Commands")
  log(`  ${ANSI_COLORS.cyan}aegis setup-keys${ANSI_COLORS.reset}     - Interactive API key configuration`)
  log(`  ${ANSI_COLORS.cyan}aegis doctor${ANSI_COLORS.reset}         - Check system health and configuration`)
  log(`  ${ANSI_COLORS.cyan}aegis wakeup${ANSI_COLORS.reset}         - Launch interactive menu`)
  log(`  ${ANSI_COLORS.cyan}aegis --help${ANSI_COLORS.reset}         - List all commands`)
  log(`  ${ANSI_COLORS.cyan}aegis version${ANSI_COLORS.reset}        - Show version info`)

  // Step 5: Show resources
  logStep("Resources")
  log(`  Documentation: ${ANSI_COLORS.cyan}https://github.com/KunjShah95/neuron-os${ANSI_COLORS.reset}`)
  log(`  Report Issues: ${ANSI_COLORS.cyan}https://github.com/KunjShah95/neuron-os/issues${ANSI_COLORS.reset}`)
log(` Documentation: ${ANSI_COLORS.cyan}https://github.com/KunjShah95/neuron-os/discussions${ANSI_COLORS.reset}`)

  log("\n" + "═".repeat(60))
  log(`${ANSI_COLORS.green}✓ Installation complete!${ANSI_COLORS.reset}`)
  log("═".repeat(60) + "\n")
}

main()