import pc from "picocolors";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";

export async function handleDoctor(): Promise<void> {
  console.log(pc.bold(pc.cyan("\n🩺 Nexus Environment Diagnostics")));
  console.log(pc.dim("Checking system variables, permissions, and database runtimes...\n"));

  let errors = 0;
  let warnings = 0;

  // 1. Runtime verification
  const isBun = typeof Bun !== "undefined";
  console.log(
    `  ${pc.green("✔")} Runtime Engine: ${pc.bold(isBun ? "Bun" : "Node.js")} (${
      process.version
    })`
  );

  // 2. Write Permissions Check
  try {
    const testFile = join(process.cwd(), ".nexus-write-test");
    writeFileSync(testFile, "test");
    unlinkSync(testFile);
    console.log(`  ${pc.green("✔")} File Permissions: Write access verified in CWD`);
  } catch (err) {
    console.error(`  ${pc.red("✖")} File Permissions: Write test failed in CWD`);
    errors++;
  }

  // 3. Database Check
  let dbDriver = "None";
  try {
    if (isBun) {
      // @ts-ignore
      await import("bun:sqlite");
      dbDriver = "bun:sqlite";
    } else {
      // @ts-ignore
      await import("better-sqlite3");
      dbDriver = "better-sqlite3";
    }
    console.log(`  ${pc.green("✔")} Storage Backend: Pluggable SQLite driver (${pc.bold(dbDriver)}) active`);
  } catch (e) {
    console.log(
      `  ${pc.yellow("⚠️")} Storage Backend: No SQLite driver found. Memory fallback active.`
    );
    warnings++;
  }

  // 4. Critical API Keys Check
  const keysToCheck = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "EXA_API_KEY"];
  console.log(pc.bold("\n🔑 API Keys:"));
  for (const key of keysToCheck) {
    if (process.env[key]) {
      const val = process.env[key]!;
      const masked = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : "****";
      console.log(`  ${pc.green("✔")} ${key}: Configured (${pc.dim(masked)})`);
    } else {
      console.log(`  ${pc.yellow("⚠️")} ${key}: Unconfigured (Some agents will fail execution)`);
      warnings++;
    }
  }

  // Summary
  console.log(pc.dim("\n------------------------------------------------"));
  if (errors === 0) {
    console.log(
      pc.bold(
        pc.green(
          `🎉 Diagnostic checks completed successfully with ${warnings} warnings.`
        )
      )
    );
    if (warnings > 0) {
      console.log(
        pc.cyan(
          "💡 Tip: Configure missing API keys in your environment variables to enable all agent reasoning capabilities."
        )
      );
    }
  } else {
    console.log(
      pc.bold(
        pc.red(`❌ Diagnostic checks completed with ${errors} critical error(s). Please fix to use Nexus.`)
      )
    );
  }
  console.log();
}
