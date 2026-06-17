export const BUNDLED_TOOLSETS = [
  { name: "web", description: "Web research tools", tools: ["web_search", "web_extract", "web_fetch"], includes: [] },
  { name: "search", description: "Web search", tools: ["web_search"], includes: [] },
  { name: "vision", description: "Vision analysis", tools: ["vision_analyze"], includes: [] },
  {
    name: "image-generation",
    description: "Generate images from text descriptions using AI (FAL.ai / Replicate / Stability AI)",
    tools: ["image_generate"],
    includes: [],
  },
  {
    name: "browser",
    description: "Browser automation — navigate, click, type, screenshot, scroll, evaluate JS, and more",
    tools: ["browser"],
    includes: [],
  },
  { name: "code-execution", description: "Programmatic TypeScript execution", tools: ["execute_code"], includes: [] },
  { name: "delegation", description: "Delegate tasks to other agents", tools: ["ask_agent"], includes: [] },
  {
    name: "file-ops",
    description: "Read, write, patch, and search files",
    tools: ["read", "write", "edit", "grep", "glob"],
    includes: [],
  },
  { name: "shell", description: "Shell command execution and process management", tools: ["bash"], includes: [] },
  { name: "research", description: "Web research + file operations", tools: [], includes: ["web", "file-ops"] },
  {
    name: "full-stack",
    description: "Full development toolkit",
    tools: [],
    includes: ["research", "shell", "code-execution", "delegation"],
  },
  { name: "all", description: "All available tools — use with caution", tools: [], includes: [] },
]
