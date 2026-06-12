import pc from "picocolors";
import { resolve } from "path";
import { existsSync } from "fs";
import { NexusAgent } from "../../core/agent.js";
import { InMemoryStorageAdapter } from "../../storage/memory.js";

export async function handleRun(agentPathOrGoal: string, goalArg?: string): Promise<void> {
  let agentPath = "";
  let goal = "";

  // Check if first argument is a file that exists
  const firstArgResolved = resolve(agentPathOrGoal);
  if (existsSync(firstArgResolved) && (agentPathOrGoal.endsWith(".ts") || agentPathOrGoal.endsWith(".js"))) {
    agentPath = firstArgResolved;
    goal = goalArg || "";
  } else {
    // Treat first argument as the goal, execute a default agent
    goal = [agentPathOrGoal, goalArg].filter(Boolean).join(" ");
  }

  if (!goal) {
    console.error(pc.red("❌ Objective goal is required."));
    console.log("Usage: nexus run <goal> OR nexus run <agent-file.ts> <goal>");
    process.exit(1);
  }

  let agent: NexusAgent;

  if (agentPath) {
    console.log(pc.cyan(`🚀 Loading agent definition from ${pc.underline(agentPath)}...`));
    try {
      // Dynamic import
      const mod = await import(agentPath);
      agent = mod.agent;
      if (!agent) {
        console.error(pc.red(`❌ No exported 'agent' instance found in module.`));
        console.log(pc.yellow("Make sure your agent file exports an instance of NexusAgent named 'agent'."));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(pc.red(`❌ Failed to import agent file: ${err.message}`));
      console.error(pc.dim(err.stack));
      process.exit(1);
    }
  } else {
    // Generate default Ad-hoc agent for immediate testing
    console.log(pc.cyan("ℹ️ No agent file specified. Creating ephemeral default agent..."));
    const storage = new InMemoryStorageAdapter();
    agent = new NexusAgent({
      name: "NexusRunner",
      role: "Standard ad-hoc task executor",
      storage,
    });
  }

  console.log(
    pc.green(
      `✔ Active Agent: ${pc.bold(agent.config.name)} [Role: ${agent.config.role}]`
    )
  );
  console.log(pc.dim("Initializing reactive event telemetry listeners..."));

  // Attach event logging hooks
  agent.on("thought", (thought) => {
    console.log(`${pc.cyan("🧠 [Thought]:")} ${thought}`);
  });

  agent.on("action", (toolName, args) => {
    console.log(
      `${pc.magenta("⚡ [Action]:")} Invoking capability ${pc.bold(
        toolName
      )} with inputs: ${JSON.stringify(args)}`
    );
  });

  agent.on("revision", (critique, revisionPlan) => {
    console.log(`${pc.yellow("⚠️ [Self-Critique]:")} ${critique}`);
    console.log(`${pc.yellow("🔧 [Revision Plan]:")} ${revisionPlan}`);
  });

  agent.on("statusChange", (status) => {
    console.log(pc.dim(`  [Status changed to: ${status}]`));
  });

  agent.on("stateChange", (key, val) => {
    console.log(pc.dim(`  [Reactive State Update] ${key} -> ${JSON.stringify(val)}`));
  });

  console.log(pc.bold(pc.white(`\n🎯 Objective Goal: "${goal}"\n`)));

  try {
    await agent.storage.init();
    const result = await agent.execute(goal);
    console.log(pc.bold(pc.green("\n🏁 Execution Complete. Result:")));
    console.log(pc.white(result));
    console.log();
  } catch (err: any) {
    console.error(pc.bold(pc.red(`\n❌ Execution Terminated: ${err.message}`)));
    if (err.stack) console.error(pc.dim(err.stack));
  } finally {
    await agent.storage.close();
  }
}
