import * as p from "@clack/prompts";
import pc from "picocolors";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export async function handleInit(): Promise<void> {
  p.intro(pc.bold(pc.cyan("✨ Setup Your Nexus Agent")));

  const answers = await p.group(
    {
      name: () =>
        p.text({
          message: "What is your agent's name?",
          placeholder: "AuditScanner",
          validate: (val) => (val ? undefined : "Agent name is required"),
        }),
      role: () =>
        p.text({
          message: "Describe the agent's primary role:",
          placeholder: "Analyzes TypeScript files for dependency issues and patterns",
          validate: (val) => (val ? undefined : "Agent role description is required"),
        }),
      template: () =>
        p.select({
          message: "Select reasoning structure template:",
          options: [
            { value: "minimal", label: "Minimal (Straightforward sequential execution)" },
            { value: "tools", label: "Tool-Enabled (Equipped with standard system capability calls)" },
            { value: "reactive", label: "Reactive (Registers event listeners for real-time visualization)" },
          ],
        }),
      storage: () =>
        p.select({
          message: "Select default storage layer adapter:",
          options: [
            { value: "memory", label: "In-Memory Adapter (Ephemeral, zero-configuration)" },
            { value: "sqlite", label: "SQLite Adapter (Persistent storage, local graph/state fallback)" },
          ],
        }),
      outputDir: () =>
        p.text({
          message: "Output target directory:",
          initialValue: "./src/agents",
        }),
    },
    {
      onCancel: () => {
        p.cancel("Initialization workflow aborted.");
        process.exit(0);
      },
    }
  );

  // Ensure target folder exists
  const targetDir = join(process.cwd(), answers.outputDir);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Choose file name
  const fileName = `${answers.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ts`;
  const filePath = join(targetDir, fileName);

  // Build template code content
  const storageImport =
    answers.storage === "sqlite"
      ? 'import { NexusAgent, SQLiteStorage } from "nexus-agent-framework";\nconst storage = new SQLiteStorage({ dbPath: "./data/nexus.db" });'
      : 'import { NexusAgent, MemoryStorage } from "nexus-agent-framework";\nconst storage = new MemoryStorage();';

  let agentSetup = "";

  if (answers.template === "minimal") {
    agentSetup = `
export const agent = new NexusAgent({
  name: "${answers.name}",
  role: "${answers.role}",
  storage
});
`;
  } else if (answers.template === "tools") {
    agentSetup = `
import { z } from "zod";

const diskScannerTool = {
  name: "DiskScanner",
  description: "Scans specified directory pathways",
  inputSchema: z.object({ path: z.string() }),
  async execute({ path }: { path: string }) {
    return { filesFound: 12, path };
  }
};

export const agent = new NexusAgent({
  name: "${answers.name}",
  role: "${answers.role}",
  storage,
  tools: [diskScannerTool]
});
`;
  } else {
    agentSetup = `
export const agent = new NexusAgent({
  name: "${answers.name}",
  role: "${answers.role}",
  storage
});

// Setup reactive event channels
agent.on("thought", (thought) => {
  console.log(\`[🧠 Thought]: \${thought}\`);
});

agent.on("action", (toolName, args) => {
  console.log(\`[⚡ Executing Capability] \${toolName} with:\`, args);
});

agent.on("revision", (critique, plan) => {
  console.log(\`[⚠️ Self Critique]: \${critique}\`);
  console.log(\`[🔧 Revision Plan]: \${plan}\`);
});
`;
  }

  const fileContent = `${storageImport}\n${agentSetup}
// Export execution function
export async function executeAgent(goal: string) {
  await storage.init();
  const result = await agent.execute(goal);
  await storage.close();
  return result;
}
`;

  writeFileSync(filePath, fileContent);

  p.outro(
    pc.bold(
      pc.green(
        `🎉 Successfully scaffolded your agent in ${pc.underline(
          join(answers.outputDir, fileName)
        )}!`
      )
    )
  );
}
