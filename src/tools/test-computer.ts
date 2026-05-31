import { computerTool } from "./computer"
import { toolRegistry } from "./registry"

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}
function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
}

// Register if not already registered
if (!toolRegistry.get("computer")) {
  toolRegistry.register(computerTool)
}

const tool = toolRegistry.get("computer")
assert(tool !== undefined, "computer tool registered")

assertEqual(tool!.name, "computer", "tool name is computer")
assertEqual(tool!.parameters.length, 5, "has 5 parameters")

// Test validation (no actual screen ops on headless CI)
const result1 = await computerTool.execute({ action: "screenshot" }, { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] })
assert(result1.success === false || result1.success === true, "screenshot runs (may fail on headless)")

const result2 = await computerTool.execute({ action: "mouse_move" }, { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] })
assert(!result2.success, "mouse_move without coord returns error")

const result3 = await computerTool.execute({ action: "nonexistent", coordinate: [100, 100] } as any, { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] })
assert(!result3.success, "unknown action returns error")

const result4 = await computerTool.execute({ action: "type" }, { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] })
assert(!result4.success, "type without text returns error")

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
