#!/usr/bin/env node
import { Command } from "commander";
import { handleDoctor } from "./commands/doctor.js";
import { handleInit } from "./commands/init.js";
import { handleRun } from "./commands/run.js";
import { handleDev } from "./commands/dev.js";

const program = new Command();

program
  .name("nexus")
  .description("Nexus Agent Framework CLI - High-performance developer ergonomics")
  .version("0.1.0");

program
  .command("doctor")
  .description("Diagnose environment variables, storage access, and runtime capability compatibility")
  .action(async () => {
    await handleDoctor();
  });

program
  .command("init")
  .description("Interactively scaffold a new Nexus agent file template")
  .action(async () => {
    await handleInit();
  });

program
  .command("run")
  .description("Execute an agent file with a given objective or run a quick default test")
  .argument("[agent-file-or-goal]", "Target agent file script (.ts/.js) or raw goal string")
  .argument("[goal-args...]", "Goal text if agent file path was provided")
  .action(async (agentFileOrGoal, goalArgs) => {
    const secondArgCombined = goalArgs ? goalArgs.join(" ") : undefined;
    await handleRun(agentFileOrGoal, secondArgCombined);
  });

program
  .command("dev")
  .description("Run the agent within the live thought monitor dashboard and hot-reload simulator")
  .argument("[agent-file]", "Path to agent script file")
  .action(async (agentFile) => {
    await handleDev(agentFile);
  });

program.parse(process.argv);
export { program };
